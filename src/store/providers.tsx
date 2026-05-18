"use client";

import { injectStore } from "@/lib/http";
import { Provider } from "react-redux";
import { store } from "./index";
import { SocketProvider } from "@/context/socket-context";
import { useEffect } from "react";

injectStore(store);

export function Providers({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        if (process.env.NODE_ENV !== "development") return;

        const shouldSuppress = (...args: any[]) => {
            const combined = args
                .map((arg) => {
                    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
                    if (typeof arg === "object") {
                        try {
                            return JSON.stringify(arg);
                        } catch {
                            return String(arg);
                        }
                    }
                    return String(arg);
                })
                .join(" ");

            return /chart should be greater than 0|style of container|destroyOnClose|is deprecated|Network Error|status code 304|Request failed/i.test(
                combined
            );
        };

        const originalWarn = console.warn;
        console.warn = (...args) => {
            if (shouldSuppress(...args)) return;
            originalWarn(...args);
        };

        const originalError = console.error;
        console.error = (...args) => {
            if (shouldSuppress(...args)) return;
            originalError(...args);
        };

        return () => {
            console.warn = originalWarn;
            console.error = originalError;
        };
    }, []);

    return (
        <Provider store={store}>
            <SocketProvider>
                {children}
            </SocketProvider>
        </Provider>
    );
}
