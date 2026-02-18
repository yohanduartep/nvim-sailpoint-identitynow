export const logInfo = (message: string, ...meta: unknown[]) => {
    console.log(message, ...meta);
};

export const logWarn = (message: string, ...meta: unknown[]) => {
    console.warn(message, ...meta);
};

export const logError = (message: string, ...meta: unknown[]) => {
    console.error(message, ...meta);
};
