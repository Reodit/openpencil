import { useEffect } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useUserStore } from '@/stores/user-store'
import LoginScreen from '@/components/shared/login-screen'
import { Loader2 } from 'lucide-react'

import '@/i18n'
import { detectLanguagePostHydration } from '@/i18n'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'OpenPencil',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  shellComponent: RootDocument,
})

function NotFoundComponent() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      <p>{t('notFound.message')}</p>
    </div>
  )
}

function RootComponent() {
  const user = useUserStore((s) => s.user)
  const isLoading = useUserStore((s) => s.isLoading)
  const isHydrated = useUserStore((s) => s.isHydrated)

  useEffect(() => {
    useUserStore.getState().hydrate()
  }, [])

  if (!isHydrated || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return <LoginScreen />
  }

  return <Outlet />
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation()

  useEffect(() => {
    detectLanguagePostHydration()
  }, [])

  return (
    <html lang={i18n.language} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
