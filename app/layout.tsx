import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relatório de Indicadores Criminais | 19ª RISP",
  description:
    "Relatório institucional de auditoria dos indicadores criminais da 19ª RISP — Caldas Novas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
