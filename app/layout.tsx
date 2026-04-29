import type { Metadata } from "next";
import "./globals.css";
import { MobileNav, Sidebar } from "@/components/navigation";

export const metadata: Metadata = {
  title: "SafeOps Manager",
  description: "Plataforma B2B de gestão de segurança operacional.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="min-h-screen lg:flex">
          <Sidebar />
          <div className="flex-1">
            <MobileNav />
            <main className="p-4 sm:p-6 lg:p-10">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
