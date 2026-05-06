import AuthGuard from "@/guards/AuthGuard";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
    return <AuthGuard roles={["manager"]}>{children}</AuthGuard>;
}
