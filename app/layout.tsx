import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relatório de Indicadores Criminais | 19ª RISP",
  description:
    "Painel regional dos indicadores criminais controlados pela SSP na 19ª RISP.",
  robots: {
    index: false,
    follow: false,
  },
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
