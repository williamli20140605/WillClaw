export interface ChannelAdapter {
    readonly name: string;

    start(): Promise<boolean>;
    stop(): Promise<void>;
    sendMessage(chatId: string, text: string): Promise<void>;
    handleInboundRequest?(request: Request): Promise<Response | null>;
}

export interface ChannelNotifier {
    sendMessage(channel: string, chatId: string, text: string): Promise<boolean>;
}
