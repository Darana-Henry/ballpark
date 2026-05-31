import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, googleProvider, ALLOWED_EMAIL, isFirebaseConfigured } from '../firebase'

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined)
  const [error, setError] = useState(null)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    if (!isFirebaseConfigured) { setUser(null); return }
    return onAuthStateChanged(auth, (u) => setUser(u ?? null))
  }, [])

  async function handleSignIn() {
    setError(null)
    setSigningIn(true)
    try {
      const result = await signInWithPopup(auth, googleProvider)
      if (result.user.email !== ALLOWED_EMAIL) {
        await signOut(auth)
        setError('This account is not authorized to access Ballpark.')
      }
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') {
        setError('Sign-in failed. Please try again.')
      }
    } finally {
      setSigningIn(false)
    }
  }

  if (!isFirebaseConfigured) return children

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050c1a]">
        <div className="w-8 h-8 border-2 border-white/20 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (user && user.email !== ALLOWED_EMAIL) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050c1a]">
        <div className="text-center space-y-4 px-6">
          <p className="text-red-400 font-semibold">Not authorized</p>
          <p className="text-white/40 text-sm">This Google account isn't allowed.</p>
          <button
            onClick={() => signOut(auth)}
            className="px-4 py-2 text-sm bg-white/10 hover:bg-white/15 text-white rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex h-screen overflow-hidden">

        {/* Left half — stadium atmosphere */}
        <div className="hidden md:flex w-1/2 relative flex-col justify-end">
          <div className="absolute inset-0" style={{ backgroundImage: 'url(/ballpark/login-bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div className="absolute inset-0" style={{ background: 'rgba(5,12,26,0.45)' }} />
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }} />
          <div
            className="absolute inset-0 flex items-center justify-center select-none pointer-events-none"
            style={{ fontSize: 400, opacity: 0.03, filter: 'blur(4px)', lineHeight: 1 }}
          >
            ⚾
          </div>
          <div className="relative z-10 p-10">
            <p className="text-white/25 text-xs uppercase tracking-[0.2em] font-medium mb-3">
              Track every game
            </p>
            <div className="flex gap-2 flex-wrap">
              {['⚾ MLB', '🏀 NBA', '🏈 NFL', '🏏 BBL', '⚽ MLS'].map(l => (
                <span
                  key={l}
                  className="text-xs text-white/40 bg-white/5 border border-white/8 rounded-full px-3 py-1.5 font-medium"
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right half — login */}
        <div
          className="w-full md:w-1/2 flex flex-col items-center justify-center px-8"
          style={{ background: 'linear-gradient(160deg, #0f1e3a 0%, #0a1428 100%)' }}
        >
          <div className="w-full max-w-sm">
            {/* Logo + title */}
            <div className="flex items-center gap-3 mb-14">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                ⚾
              </div>
              <div>
                <h1 className="text-white font-bold text-xl leading-tight tracking-tight">Ballpark</h1>
                <p className="text-white/35 text-sm">Sports tracker</p>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 px-4 py-3 rounded-xl bg-red-950/50 border border-red-800/40">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Sign in button */}
            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="w-full py-4 rounded-full font-bold uppercase tracking-[0.15em] text-sm text-white transition-all disabled:opacity-60"
              style={{
                background: 'linear-gradient(90deg, #06d6f0, #2979f5)',
                boxShadow: '0 8px 32px rgba(6,214,240,0.25)',
              }}
              onMouseEnter={e => { if (!signingIn) e.currentTarget.style.boxShadow = '0 8px 44px rgba(6,214,240,0.42)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 8px 32px rgba(6,214,240,0.25)' }}
            >
              {signingIn ? 'Signing in…' : 'Sign in with Google'}
            </button>

            {/* Footer */}
            <p className="text-center text-white/20 text-xs mt-14">
              Privacy&nbsp;·&nbsp;Terms&nbsp;·&nbsp;About
            </p>
          </div>
        </div>

      </div>
    )
  }

  return children
}
