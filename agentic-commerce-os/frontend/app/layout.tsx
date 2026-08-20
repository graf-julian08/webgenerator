import "./globals.css";

export const metadata = {
  title: "Agentic Commerce OS",
  description: "Multi-agent luxury e-commerce component generator",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0A0A0A] text-[#FAFAFA] min-h-screen">
        {children}
      </body>
    </html>
  );
}
