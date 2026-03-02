import React from "react";

export const metadata = {
  title: "NBA AI Betting Engine",
  description: "Serious predictive NBA model",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
