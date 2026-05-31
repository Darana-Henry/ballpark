import { useState } from 'react'

// ─── Color helpers ────────────────────────────────────────────────────────────

export function getBaStyle(ba) {
  if (ba >= 0.300) return { color: 'text-green-400',  ring: 'ring-green-500/30',  label: 'Excellent' }
  if (ba >= 0.250) return { color: 'text-yellow-400', ring: 'ring-yellow-500/30', label: 'Average'   }
  if (ba >= 0.220) return { color: 'text-orange-400', ring: 'ring-orange-500/30', label: 'Below Avg' }
  return                  { color: 'text-red-400',    ring: 'ring-red-500/30',    label: 'Struggling' }
}

export function getHRStyle(hr) {
  if (hr >= 20) return { color: 'text-green-400',  ring: 'ring-green-500/30',  label: 'Power'   }
  if (hr >= 10) return { color: 'text-yellow-400', ring: 'ring-yellow-500/30', label: 'Good'    }
  if (hr >= 5)  return { color: 'text-orange-400', ring: 'ring-orange-500/30', label: 'Average' }
  return               { color: 'text-slate-400',  ring: 'ring-slate-600/20',  label: 'Limited' }
}

export function getRBIStyle(rbi) {
  if (rbi >= 60) return { color: 'text-green-400',  ring: 'ring-green-500/30',  label: 'Elite'   }
  if (rbi >= 40) return { color: 'text-yellow-400', ring: 'ring-yellow-500/30', label: 'Solid'   }
  if (rbi >= 20) return { color: 'text-orange-400', ring: 'ring-orange-500/30', label: 'Average' }
  return                { color: 'text-slate-400',  ring: 'ring-slate-600/20',  label: 'Limited' }
}

export function getEraStyle(era) {
  if (era === Infinity) return { color: 'text-red-400', ring: 'ring-red-500/30', label: 'Struggling' }
  if (era < 3.00) return { color: 'text-green-400',  ring: 'ring-green-500/30',  label: 'Elite'      }
  if (era < 4.00) return { color: 'text-yellow-400', ring: 'ring-yellow-500/30', label: 'Solid'      }
  if (era < 5.00) return { color: 'text-orange-400', ring: 'ring-orange-500/30', label: 'Average'    }
  return                 { color: 'text-red-400',    ring: 'ring-red-500/30',    label: 'Struggling' }
}

export function getWinsStyle(wins) {
  if (wins >= 10) return { color: 'text-green-400',  ring: 'ring-green-500/30',  label: 'Ace'      }
  if (wins >= 7)  return { color: 'text-yellow-400', ring: 'ring-yellow-500/30', label: 'Solid'    }
  if (wins >= 4)  return { color: 'text-orange-400', ring: 'ring-orange-500/30', label: 'Average'  }
  return                 { color: 'text-slate-400',  ring: 'ring-slate-600/20',  label: 'Building' }
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function PlayerPhoto({ src, name, size = 44 }) {
  const [err, setErr] = useState(false)
  const initials = name?.split(' ').map(p => p[0]).join('').slice(0, 2)
  if (!src || err) {
    return (
      <div
        className="rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-400 shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.3 }}
      >
        {initials}
      </div>
    )
  }
  return (
    <img src={src} alt={name} width={size} height={size}
      className="rounded-full object-cover object-top bg-slate-800 shrink-0 ring-2 ring-slate-700"
      onError={() => setErr(true)}
    />
  )
}

const RANK_STYLES = [
  'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  'bg-slate-500/20  text-slate-300  border-slate-500/40',
  'bg-amber-700/20  text-amber-600  border-amber-700/40',
]

// Compact card designed for 3-column grid
function StatCard({ player, rank, primaryValue, primaryLabel, style, secondaryStats }) {
  // Use last name only to fit narrow columns
  const lastName = player.name.split(' ').slice(-1)[0]

  return (
    <div className={`rounded-xl bg-[#161622] border border-slate-800 p-3 flex flex-col items-center text-center ring-1 ${style.ring}`}>
      {/* Photo + rank badge */}
      <div className="relative mb-2">
        <PlayerPhoto src={player.photo} name={player.name} size={44} />
        <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center border ${RANK_STYLES[rank]}`}>
          {rank + 1}
        </span>
      </div>

      {/* Name */}
      <p className="text-xs font-semibold text-slate-200 leading-tight truncate w-full mb-1.5">
        {lastName}
      </p>

      {/* Primary stat */}
      <p className={`text-xl font-bold tabular-nums leading-none ${style.color}`}>
        {primaryValue}
      </p>
      <p className="text-[10px] text-slate-600 mt-0.5">{primaryLabel}</p>

      {/* Quality label */}
      <span className={`mt-1.5 mb-2 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-slate-900 ${style.color}`}>
        {style.label}
      </span>

      {/* Secondary stats */}
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5">
        {secondaryStats.map(s => (
          <span key={s.label} className="text-[10px] text-slate-500 whitespace-nowrap">
            <span className="text-slate-300 font-medium">{s.value}</span> {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Specific cards ───────────────────────────────────────────────────────────

export function HitterCard({ player, rank }) {
  return (
    <StatCard
      player={player} rank={rank}
      primaryValue={player.baDisplay} primaryLabel="BA"
      style={getBaStyle(player.ba)}
      secondaryStats={[
        { value: player.hr,    label: 'HR'  },
        { value: player.rbi,   label: 'RBI' },
        { value: player.ops,   label: 'OPS' },
        { value: player.games, label: 'G'   },
      ]}
    />
  )
}

export function HRLeaderCard({ player, rank }) {
  return (
    <StatCard
      player={player} rank={rank}
      primaryValue={player.hr} primaryLabel="HR"
      style={getHRStyle(player.hr)}
      secondaryStats={[
        { value: player.baDisplay, label: 'AVG' },
        { value: player.rbi,       label: 'RBI' },
        { value: player.ops,       label: 'OPS' },
        { value: player.games,     label: 'G'   },
      ]}
    />
  )
}

export function RBILeaderCard({ player, rank }) {
  return (
    <StatCard
      player={player} rank={rank}
      primaryValue={player.rbi} primaryLabel="RBI"
      style={getRBIStyle(player.rbi)}
      secondaryStats={[
        { value: player.baDisplay, label: 'AVG' },
        { value: player.hr,        label: 'HR'  },
        { value: player.ops,       label: 'OPS' },
        { value: player.games,     label: 'G'   },
      ]}
    />
  )
}

export function PitcherCard({ player, rank }) {
  return (
    <StatCard
      player={player} rank={rank}
      primaryValue={player.eraDisplay} primaryLabel="ERA"
      style={getEraStyle(player.era)}
      secondaryStats={[
        { value: `${player.wins}–${player.losses}`, label: 'W-L' },
        { value: player.strikeouts,                 label: 'K'   },
        { value: player.whip,                       label: 'WHIP'},
        { value: player.games,                      label: 'G'   },
      ]}
    />
  )
}

export function WinsLeaderCard({ player, rank }) {
  return (
    <StatCard
      player={player} rank={rank}
      primaryValue={player.wins} primaryLabel="W"
      style={getWinsStyle(player.wins)}
      secondaryStats={[
        { value: player.eraDisplay,                 label: 'ERA' },
        { value: `${player.wins}–${player.losses}`, label: 'W-L' },
        { value: player.strikeouts,                 label: 'K'   },
        { value: player.games,                      label: 'G'   },
      ]}
    />
  )
}

// ─── NBA cards ────────────────────────────────────────────────────────────────

export function getPPGStyle(ppg) {
  if (ppg >= 25) return { color: 'text-green-400',  ring: 'ring-green-500/30',  label: 'Elite'   }
  if (ppg >= 18) return { color: 'text-yellow-400', ring: 'ring-yellow-500/30', label: 'Solid'   }
  if (ppg >= 12) return { color: 'text-orange-400', ring: 'ring-orange-500/30', label: 'Average' }
  return               { color: 'text-slate-400',  ring: 'ring-slate-600/20',  label: 'Limited' }
}

export function getRPGStyle(rpg) {
  if (rpg >= 10) return { color: 'text-green-400',  ring: 'ring-green-500/30',  label: 'Elite'   }
  if (rpg >= 7)  return { color: 'text-yellow-400', ring: 'ring-yellow-500/30', label: 'Solid'   }
  if (rpg >= 5)  return { color: 'text-orange-400', ring: 'ring-orange-500/30', label: 'Average' }
  return               { color: 'text-slate-400',  ring: 'ring-slate-600/20',  label: 'Limited' }
}

export function getAPGStyle(apg) {
  if (apg >= 8) return { color: 'text-green-400',  ring: 'ring-green-500/30',  label: 'Elite'   }
  if (apg >= 5) return { color: 'text-yellow-400', ring: 'ring-yellow-500/30', label: 'Solid'   }
  if (apg >= 3) return { color: 'text-orange-400', ring: 'ring-orange-500/30', label: 'Average' }
  return              { color: 'text-slate-400',  ring: 'ring-slate-600/20',  label: 'Limited' }
}

export function NBAScorerCard({ player, rank }) {
  return (
    <StatCard
      player={player} rank={rank}
      primaryValue={player.ppg} primaryLabel="PPG"
      style={getPPGStyle(parseFloat(player.ppg))}
      secondaryStats={[
        { value: player.rpg,   label: 'RPG' },
        { value: player.apg,   label: 'APG' },
        { value: player.games, label: 'G'   },
      ]}
    />
  )
}

export function NBARebounderCard({ player, rank }) {
  return (
    <StatCard
      player={player} rank={rank}
      primaryValue={player.rpg} primaryLabel="RPG"
      style={getRPGStyle(parseFloat(player.rpg))}
      secondaryStats={[
        { value: player.ppg,   label: 'PPG' },
        { value: player.apg,   label: 'APG' },
        { value: player.games, label: 'G'   },
      ]}
    />
  )
}

export function NBAAssistCard({ player, rank }) {
  return (
    <StatCard
      player={player} rank={rank}
      primaryValue={player.apg} primaryLabel="APG"
      style={getAPGStyle(parseFloat(player.apg))}
      secondaryStats={[
        { value: player.ppg,   label: 'PPG' },
        { value: player.rpg,   label: 'RPG' },
        { value: player.games, label: 'G'   },
      ]}
    />
  )
}
