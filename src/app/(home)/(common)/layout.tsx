import AuthGuard from "@/guards/AuthGuard";

export default function CommonLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
