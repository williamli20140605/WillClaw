export interface ChannelAdapter {
    readonly name: string;

    start(): Promise<boolean>;
    stop(): Promise<void>;
    sendMessage(chatId: string, text: string): Promise<void>;
}

export interface ChannelNotifier {
    sendMessage(channel: string, chatId: string, text: string): Promise<boolean>;
}
