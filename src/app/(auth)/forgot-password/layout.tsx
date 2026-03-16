import { ReactNode } from "react";

interface ForgotPasswordLayoutProps {
    children: ReactNode;
}

export default function ForgotPasswordLayout({ children }: ForgotPasswordLayoutProps) {
    return (
        <>{children}</>
    );
}
