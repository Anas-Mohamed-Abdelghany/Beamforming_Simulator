import { useState } from 'react'
import FiveGMode from './modes/5g/FiveGMode.jsx'
import DopplerMode from './advanced/DopplerMode.jsx'
import RadarMode from './modes/radar/RadarMode.jsx'
import AdvancedMode from './advanced/AdvancedMode.jsx'
import './index.css'

/* ── Tab configuration ──────────────────────────────────────────────────── */
const TABS = [
  {
    id: 'ultrasound',
    label: 'Ultrasound',
    icon: '🩺',
    accent: '#22d3ee',
    placeholder: true,
    ownerLabel: 'M2',
  },
  {
    id: '5g',
    label: '5G',
    icon: '📡',
    accent: '#61dafb',
    placeholder: false,
  },
  {
    id: 'radar',
    label: 'Radar',
    icon: '🎯',
    accent: '#8b5cf6',
  },
  {
    id: 'doppler',
    label: 'Doppler',
    icon: '🩸',
    accent: '#ef4444',
    placeholder: false,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: '⚡',
    accent: '#f59e0b',
    placeholder: false,
  },
]

/* ── Placeholder for modes not yet implemented ──────────────────────────── */
function PlaceholderMode({ tab }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      color: 'var(--text-muted)',
    }}>
      <div style={{ fontSize: 64, lineHeight: 1 }}>{tab.icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tab.accent }}>
        {tab.label} Mode
      </div>
      <div style={{
        fontSize: 13,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 24px',
        color: 'var(--text-secondary)',
      }}>
        Implemented by Member {tab.ownerLabel} — module pending integration
      </div>
    </div>
  )
}

/* ── Main App ─────────────────────────────────────────────────────────────── */
export default function App() {
  const [activeTab, setActiveTab] = useState('5g')

  const current = TABS.find(t => t.id === activeTab)

  function renderMode() {
    switch (activeTab) {
      case '5g': return <FiveGMode />
      case 'doppler': return <DopplerMode />
      case 'advanced': return <AdvancedMode />
      case 'radar': return <RadarMode />
      default: return <PlaceholderMode tab={current} />
    }
  }

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ── Top tab bar ────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        height: 48,
      }}>
        {/* Brand */}
        <div style={{
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderRight: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.02em',
          }}>
            BeamSim
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', flex: 1 }}>
          {TABS.map(tab => {
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '0 22px',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? `2px solid ${tab.accent}` : '2px solid transparent',
                  color: isActive ? tab.accent : 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'color .15s, border-color .15s',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '0.01em',
                  position: 'relative',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: 15 }}>{tab.icon}</span>
                {tab.label}
                {tab.placeholder && (
                  <span style={{
                    fontSize: 9,
                    padding: '1px 5px',
                    borderRadius: 4,
                    background: 'rgba(90,100,120,.3)',
                    color: 'var(--text-muted)',
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                  }}>
                    {tab.ownerLabel}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Version badge */}
        <div style={{
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          borderLeft: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            v1.0
          </span>
        </div>
      </div>

      {/* ── Mode content ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {renderMode()}
      </div>
    </div>
  )
}
