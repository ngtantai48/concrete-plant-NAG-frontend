"use client";

import { SocketProvider } from "@/context/socket-context";
import { injectStore } from "@/lib/http";
import { Provider } from "react-redux";
import { store } from "./index";

injectStore(store);

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <Provider store={store}>
            <SocketProvider>
                {children}
            </SocketProvider>
        </Provider>
    );
}
