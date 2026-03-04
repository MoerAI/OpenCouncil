'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white px-6 py-3">
      <nav className="mx-auto flex max-w-7xl items-center justify-between">
        <Link href="/debates" className="text-lg font-bold text-gray-900">
          OpenCouncil
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/debates/new"
            className="text-sm font-medium text-gray-700 hover:text-blue-600"
          >
            New Debate
          </Link>
          <Link
            href="/settings/api-keys"
            className="text-sm font-medium text-gray-700 hover:text-blue-600"
          >
            API Keys
          </Link>
          <button
            onClick={() => void signOut({ callbackUrl: '/auth/signin' })}
            className="text-sm font-medium text-gray-500 hover:text-red-600"
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>
  )
}
