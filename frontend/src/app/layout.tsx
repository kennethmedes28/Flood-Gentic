import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import "./glass.css"
import { HandCursor } from "@/components/shell/HandCursor"
import { CurrentCityProvider } from "@/context/CurrentCityContext"
import { LookProvider } from "@/context/LookContext"
import { HandProvider } from "@/context/HandContext"
import { GlassProvider } from "@/context/GlassContext"
import { ThemeProvider } from "@/context/ThemeProvider"
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
            <LookProvider>
              <HandProvider>
                <CurrentCityProvider>
                  {children}
                  <HandCursor />
                </CurrentCityProvider>
              </HandProvider>
            </LookProvider>
          </GlassProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
