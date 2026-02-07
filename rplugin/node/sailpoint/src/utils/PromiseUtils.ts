import * as vscode from '../vscode';

// Returns a promise that rejects if the provided cancellation token is triggered.
export async function getCancelPromise(token: vscode.CancellationToken, errorConstructor?: new (...a: any[]) => Error, ...args: unknown[]): Promise<never> {
    return new Promise((resolve, reject) => {
        const disposable = token.onCancellationRequested(() => {
            disposable.dispose();

            if (errorConstructor) {
                reject(new errorConstructor(args));
            } else {
                reject(new Error('Operation cancelled.'));
            }
        });
    });
}
