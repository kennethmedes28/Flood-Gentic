import { Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import "./glass.css"
import { AuthProvider } from "@/context/AuthContext"
import { HandCursor } from "@/components/shell/HandCursor"
import { CurrentCityProvider } from "@/context/CurrentCityContext"
import { LookProvider } from "@/context/LookContext"
import { HandProvider } from "@/context/HandContext"
import { LanguageProvider } from "@/context/LanguageContext"
import { IconSizeProvider } from "@/context/IconSizeContext"
import { GlassProvider } from "@/context/GlassContext"
import { TextSizeProvider } from "@/context/TextSizeContext"
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
          <LanguageProvider>
          <GlassProvider>
            <LookProvider>
              <HandProvider>
                <CurrentCityProvider>
                  <AuthProvider>
                    <TextSizeProvider>
                      <IconSizeProvider>{children}</IconSizeProvider>
                    </TextSizeProvider>
                  </AuthProvider>
                  <HandCursor />
                </CurrentCityProvider>
              </HandProvider>
            </LookProvider>
          </GlassProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
