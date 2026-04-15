import AuthGuard from "@/guards/AuthGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return <AuthGuard roles={["customer"]}>{children}</AuthGuard>;
}
