import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { useTodos, type Level, type Todo } from './needs'

const GROUPS: { level: Level; title: string }[] = [
  { level: 'crit', title: 'Urgent' },
  { level: 'warn', title: 'Soon' },
  { level: 'info', title: 'When you can' },
]

// Everything that needs the admin, on its own tab
export default function NeedsYou() {
  const todos = useTodos()
  if (!todos) return <Layout><p className="muted center">Loading…</p></Layout>

  return (
    <Layout>
      <h2 className="dash-date">Needs you</h2>
      {todos.length === 0 && <section className="card"><p className="muted">Nothing needs you right now.</p></section>}
      {GROUPS.map((g) => {
        const list = todos.filter((t) => t.level === g.level)
        if (!list.length) return null
        return (
          <section className="card needs-you" key={g.level}>
            <div className="card-head"><h3>{g.title}</h3><span className="muted small">{list.length}</span></div>
            <ul className="list">{list.map((t, i) => <Row key={i} t={t} />)}</ul>
          </section>
        )
      })}
    </Layout>
  )
}

function Row({ t }: { t: Todo }) {
  return (
    <li>
      <span className={`level ${t.level}`} aria-hidden="true" />
      <div className="list-main"><strong>{t.title}</strong><div className="muted small">{t.detail}</div></div>
      <Link to={t.to} className="dark-btn small-btn">{t.action}</Link>
    </li>
  )
}
