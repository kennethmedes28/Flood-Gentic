import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import "./glass.css"
import { HandCursor } from "@/components/ar/HandCursor"
import { GlassProvider } from "@/context/GlassContext"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", geist.variable)}
    >
      <body>
        <ThemeProvider>
          <GlassProvider>
            {children}
            <HandCursor />
          </GlassProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
