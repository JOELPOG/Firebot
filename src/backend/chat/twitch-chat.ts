import { EventEmitter } from "events";
import { ChatClient } from "@twurple/chat";

import chatHelpers from "./chat-helpers";
import activeUserHandler, { User } from "./chat-listeners/active-user-handler";
import twitchChatListeners from "./chat-listeners/twitch-chat-listeners";
import * as twitchSlashCommandHandler from "./twitch-slash-command-handler";

import logger from "../logwrapper";
import firebotDeviceAuthProvider from "../auth/firebot-device-auth-provider";
import accountAccess from "../common/account-access";
import frontendCommunicator from "../common/frontend-communicator";
import chatRolesManager from "../roles/chat-roles-manager";
import twitchApi from "../twitch-api/api";
import chatterPoll from "../twitch-api/chatter-poll";

interface ChatMessageRequest {
    message: string;
    accountType: string;
    replyToMessageId?: string;
}

interface UserModRequest {
    username: string;
    shouldBeMod: boolean;
}

interface UserBanRequest {
    username: string;
    shouldBeBanned: boolean;
}

interface UserVipRequest {
    username: string;
    shouldBeVip: boolean;
}

class TwitchChat extends EventEmitter {
    private _streamerIncomingChatClient: ChatClient;
    private _streamerOutgoingingChatClient: ChatClient;
    private _botChatClient: ChatClient;

    constructor() {
        super();

        this._streamerIncomingChatClient = null;
        this._streamerOutgoingingChatClient = null;
        this._botChatClient = null;
    }

    /**
     * Whether or not the streamer is currently connected
     */
    get chatIsConnected(): boolean {
        return (
            this._streamerIncomingChatClient?.irc?.isConnected === true &&
            this._streamerOutgoingingChatClient?.irc?.isConnected === true
        );
    }

    /**
     * Disconnects the streamer and bot from chat
     */
    async disconnect(emitDisconnectEvent = true): Promise<void> {
        if (this._streamerIncomingChatClient != null) {
            this._streamerIncomingChatClient.quit();
            this._streamerIncomingChatClient = null;
        }
        if (this._streamerOutgoingingChatClient != null) {
            this._streamerOutgoingingChatClient.quit();
            this._streamerOutgoingingChatClient = null;
        }
        if (this._botChatClient != null && this._botChatClient?.irc?.isConnected === true) {
            this._botChatClient.quit();
            this._botChatClient = null;
        }
        if (emitDisconnectEvent) {
            this.emit("disconnected");
        }
        chatterPoll.stopChatterPoll();

        activeUserHandler.clearAllActiveUsers();
    }

    /**
     * Connects the streamer and bot to chat
     */
    async connect(): Promise<void> {
        const streamer = accountAccess.getAccounts().streamer;
        if (!streamer.loggedIn) {
            return;
        }

        const streamerAuthProvider = firebotDeviceAuthProvider.streamerProvider;
        const botAuthProvider = firebotDeviceAuthProvider.botProvider;
        if (streamerAuthProvider == null && botAuthProvider == null) {
            return;
        }

        this.emit("connecting");
        await this.disconnect(false);

        try {
            this._streamerIncomingChatClient = new ChatClient({
                authProvider: streamerAuthProvider,
                requestMembershipEvents: true
            });
            this._streamerOutgoingingChatClient = new ChatClient({
                authProvider: streamerAuthProvider,
                requestMembershipEvents: true
            });

            this._streamerIncomingChatClient.irc.onRegister(() => {
                this._streamerIncomingChatClient.join(streamer.username);
                frontendCommunicator.send("twitch:chat:autodisconnected", false);
            });
            this._streamerOutgoingingChatClient.irc.onRegister(() => {
                this._streamerOutgoingingChatClient.join(streamer.username);
            });

            this._streamerIncomingChatClient.irc.onPasswordError((event) => {
                logger.error("Failed to connect to chat", event);
                frontendCommunicator.send(
                    "error",
                    `Unable to connect to chat. Reason: "${event.message}". Try signing out and back into your streamer/bot account(s).`
                );
                this.disconnect(true);
            });

            this._streamerIncomingChatClient.irc.onConnect(() => {
                this.emit("connected");
            });

            this._streamerIncomingChatClient.irc.onDisconnect((manual, reason) => {
                if (!manual) {
                    logger.error("Chat disconnected unexpectedly", reason);
                    frontendCommunicator.send("twitch:chat:autodisconnected", true);
                }
            });

            this._streamerOutgoingingChatClient.irc.onDisconnect((manual, reason) => {
                if (!manual) {
                    logger.error("Chat disconnected unexpectedly", reason);
                    frontendCommunicator.send("twitch:chat:autodisconnected", true);
                }
            });

            this._streamerIncomingChatClient.connect();
            this._streamerOutgoingingChatClient.connect();

            await chatHelpers.handleChatConnect();

            chatterPoll.startChatterPoll();

            const vips = await twitchApi.channels.getVips();
            if (vips) {
                chatRolesManager.loadUsersInVipRole(vips);
            }
        } catch (error) {
            logger.error("Chat connect error", error);
            await this.disconnect();
        }

        try {
            const bot = accountAccess.getAccounts().bot;

            if (bot.loggedIn) {
                this._botChatClient = new ChatClient({
                    authProvider: botAuthProvider,
                    requestMembershipEvents: true
                });

                this._botChatClient.irc.onRegister(() => this._botChatClient.join(streamer.username));

                twitchChatListeners.setupBotChatListeners(this._botChatClient);

                this._botChatClient.connect();
            } else {
                this._botChatClient = null;
            }
        } catch (error) {
            logger.error("Error joining streamers chat channel with Bot account", error);
        }

        try {
            twitchChatListeners.setupChatListeners(this._streamerIncomingChatClient, this._botChatClient);
        } catch (error) {
            logger.error("Error setting up chat listeners", error);
        }
    }

    /**
     * Sends a chat message to the streamers chat (INTERNAL USE ONLY)
     * @param {string} message The message to send
     * @param {string} accountType The type of account to whisper with ('streamer' or 'bot')
     */
    async _say(message: string, accountType: string, replyToId?: string): Promise<void> {
        const chatClient = accountType === "bot" ? this._botChatClient : this._streamerOutgoingingChatClient;
        try {
            logger.debug(`Sending message as ${accountType}.`);

            const streamer = accountAccess.getAccounts().streamer;
            chatClient.say(streamer.username, message, replyToId ? { replyTo: replyToId } : undefined);
        } catch (error) {
            logger.error(`Error attempting to send message with ${accountType}`, error);
        }
    }

    /**
     * Sends a whisper to the given user (INTERNAL USE ONLY)
     * @param {string} message The message to send
     * @param {string} accountType The type of account to whisper with ('streamer' or 'bot')
     */
    async _whisper(message: string, username = "", accountType: string): Promise<void> {
        try {
            logger.debug(`Sending whisper as ${accountType} to ${username}.`);

            const recipient = await twitchApi.users.getUserByName(username);
            await twitchApi.whispers.sendWhisper(recipient.id, message, accountType === "bot");
        } catch (error) {
            logger.error(`Error attempting to send whisper with ${accountType}`, error);
        }
    }

    /**
     * Sends the message as the bot if available, otherwise as the streamer.
     * If a username is provided, the message will be whispered.
     * If the message is too long, it will be automatically broken into multiple fragments and sent individually.
     *
     * @param message The message to send
     * @param username If provided, message will be whispered to the given user.
     * @param accountType Which account to chat as. Defaults to bot if available otherwise, the streamer.
     * @param replyToMessageId A message id to reply to
     */
    async sendChatMessage(
        message: string,
        username?: string,
        accountType?: string,
        replyToMessageId?: string
    ): Promise<void> {
        if (message == null || message?.length < 1) {
            return null;
        }

        // Normalize account type
        if (accountType != null) {
            accountType = accountType.toLowerCase();
        }

        const shouldWhisper = username != null && username.trim() !== "";

        const botAvailable =
            accountAccess.getAccounts().bot.loggedIn && this._botChatClient && this._botChatClient.irc.isConnected;
        if (accountType == null) {
            accountType = botAvailable && !shouldWhisper ? "bot" : "streamer";
        } else if (accountType === "bot" && !botAvailable) {
            accountType = "streamer";
        }

        const slashCommandValidationResult = twitchSlashCommandHandler.validateChatCommand(message);

        // If the slash command handler finds, validates, and successfully executes a command, no need to continue.
        if (slashCommandValidationResult != null && slashCommandValidationResult.success === true) {
            const slashCommandResult = await twitchSlashCommandHandler.processChatCommand(
                message,
                accountType === "bot"
            );
            if (slashCommandResult === true) {
                return;
            }
        }

        // split message into fragments that don't exceed the max message length
        const messageFragments = message
            .match(/[\s\S]{1,500}/g)
            .map((mf) => mf.trim())
            .filter((mf) => mf !== "");

        // Send all message fragments
        for (const fragment of messageFragments) {
            if (shouldWhisper) {
                await this._whisper(fragment, username, accountType);
            } else {
                await this._say(fragment, accountType, replyToMessageId);
            }
        }
    }

    async populateChatterList(): Promise<void> {
        await chatterPoll.runChatterPoll();
    }

    async getViewerList(): Promise<User[]> {
        const users = activeUserHandler.getAllOnlineUsers();
        return users;
    }
}

const twitchChat = new TwitchChat();

frontendCommunicator.onAsync("send-chat-message", async (sendData: ChatMessageRequest) => {
    const { message, accountType, replyToMessageId } = sendData;

    await twitchChat.sendChatMessage(message, null, accountType, replyToMessageId);
});

frontendCommunicator.onAsync("delete-message", async (messageId: string) => {
    return await twitchApi.chat.deleteChatMessage(messageId);
});

frontendCommunicator.onAsync("update-user-mod-status", async (data: UserModRequest) => {
    if (data == null) {
        return;
    }
    const { username, shouldBeMod } = data;
    if (username == null || shouldBeMod == null) {
        return;
    }

    const user = await twitchApi.users.getUserByName(username);
    if (user == null) {
        return;
    }

    if (shouldBeMod) {
        await twitchApi.moderation.addChannelModerator(user.id);
    } else {
        await twitchApi.moderation.removeChannelModerator(user.id);
    }
});

frontendCommunicator.onAsync("update-user-banned-status", async (data: UserBanRequest) => {
    if (data == null) {
        return;
    }
    const { username, shouldBeBanned } = data;
    if (username == null || shouldBeBanned == null) {
        return;
    }

    const user = await twitchApi.users.getUserByName(username);
    if (user == null) {
        return;
    }

    if (shouldBeBanned) {
        await twitchApi.moderation.banUser(user.id, "Banned via Firebot");
    } else {
        await twitchApi.moderation.unbanUser(user.id);
    }
});

frontendCommunicator.onAsync("update-user-vip-status", async (data: UserVipRequest) => {
    if (data == null) {
        return;
    }
    const { username, shouldBeVip } = data;
    if (username == null || shouldBeVip == null) {
        return;
    }

    const user = await twitchApi.users.getUserByName(username);
    if (user == null) {
        return;
    }

    if (shouldBeVip) {
        await twitchApi.moderation.addChannelVip(user.id);
        chatRolesManager.addVipToVipList(username);
    } else {
        await twitchApi.moderation.removeChannelVip(user.id);
        chatRolesManager.removeVipFromVipList(username);
    }
});

export = twitchChat;