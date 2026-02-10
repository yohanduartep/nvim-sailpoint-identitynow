import { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import axiosRetry from 'axios-retry';
import { window } from "../vscode";

// Configures an Axios instance with standard interceptors and retry logic.
export const configureAxios = (instance: AxiosInstance) => {
    axiosRetry(instance, {
        retries: 5,
        retryDelay: (retryCount, error) => {
            const retryAfter = error.response?.headers?.['retry-after'];
            if (retryAfter) {
                const parsed = parseInt(retryAfter);
                return Number.isNaN(parsed) ? (Date.parse(retryAfter) - Date.now()) : parsed * 1000;
            }
            return axiosRetry.exponentialDelay(retryCount);
        },
        retryCondition: (error) => {
            return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429;
        },
        shouldResetTimeout: true
    });

    instance.interceptors.response.use(undefined, (e) => onErrorResponse(e, instance));
    return instance;
};

export const onErrorResponse = async (error: any, instance: AxiosInstance) => {
    const config = error.config || error.response?.config;
    
    let errorMessage = error.message || 'Unknown Error';
    let method = config?.method?.toUpperCase() || 'UNKNOWN';
    let url = config?.url || 'UNKNOWN';
    const status = error.response?.status || 'UNKNOWN';

    const data = error.response?.data;
    if (data && typeof data === 'object') {
        if (data.error) errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        else if (data.message) errorMessage = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
        else if (data.detail) errorMessage = data.detail;
        else if (data.formatted_msg) errorMessage = data.formatted_msg;
        else errorMessage = JSON.stringify(data);
    }

    const detailedMessage = `[${method}] ${url} (${status}): ${errorMessage}`;
    console.error(`[SailPoint] ${detailedMessage}`);
    
    // Notify the user in Neovim
    window.showErrorMessage(detailedMessage);

    return Promise.reject(new Error(detailedMessage));
};
