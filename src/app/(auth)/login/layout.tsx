import GuestGuard from "@/guards/GuestGuard";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return (
        <GuestGuard>{children}</GuestGuard>
    );
}
