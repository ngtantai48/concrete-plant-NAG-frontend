import AuthGuard from "@/guards/AuthGuard";

export default function DispatcherLayout({ children }: { children: React.ReactNode }) {
    return <AuthGuard roles={["dispatcher"]}>{children}</AuthGuard>;
}
