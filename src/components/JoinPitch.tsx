import { useState } from 'react'

type Lang = 'en' | 'es'

const TEXT: Record<Lang, { title: string; intro: string; perks: string[]; howTitle: string; steps: [string, string][]; needTitle: string; needs: string[]; start: string }> = {
  en: {
    title: 'Join our moving crew',
    intro: 'DMV Trusted Movers does home and office moves around DC, Maryland and Northern Virginia. You choose when you work, and everything runs through this app on your phone.',
    perks: ['Pick the days you want to work', 'Paid after every job by Zelle, plus customer tips', 'No experience needed: you work next to a lead mover', 'The app works in English and Spanish'],
    howTitle: 'How it works',
    steps: [
      ['Create your account', 'Fill in the form below with your name, email and a password. Confirm your email.'],
      ['Send your papers', 'Upload a photo of your ID and agree to our crew rules. It takes a few minutes, right in the app.'],
      ['We call you', 'The office reviews your papers, calls you, and adds you to the crew.'],
      ['Mark your free days', 'In My availability, tap the days you can work. The office sees them when it picks the crew for a move.'],
      ['Get jobs', 'Open jobs show up in Find Job, and you claim the ones you want. The office can also offer you a job, and you accept or decline.'],
      ['Work the move', 'On the day, the app gives you directions, the address and the arrival time. You clock in and out, follow the work checklist, and take photos if anything is damaged.'],
      ['Get paid', 'You are paid after each job. My earnings shows every job, your pay, your tips and what is still owed.'],
    ],
    needTitle: 'What you need',
    needs: ['18 or older, with a photo ID', 'Able to lift heavy furniture and boxes', 'On time, polite and careful in people\'s homes', 'A smartphone'],
    start: 'Ready? Create your account below.',
  },
  es: {
    title: 'Únete a nuestro equipo de mudanzas',
    intro: 'DMV Trusted Movers hace mudanzas de casas y oficinas en DC, Maryland y el norte de Virginia. Tú decides cuándo trabajas, y todo se maneja desde esta app en tu teléfono.',
    perks: ['Escoge los días que quieres trabajar', 'Pago después de cada trabajo por Zelle, más propinas de los clientes', 'No necesitas experiencia: trabajas junto a un líder', 'La app está en inglés y español'],
    howTitle: 'Cómo funciona',
    steps: [
      ['Crea tu cuenta', 'Llena el formulario de abajo con tu nombre, correo y una contraseña. Confirma tu correo.'],
      ['Envía tus papeles', 'Sube una foto de tu identificación y acepta las reglas del equipo. Toma unos minutos, en la app.'],
      ['Te llamamos', 'La oficina revisa tus papeles, te llama y te agrega al equipo.'],
      ['Marca tus días libres', 'En Mi disponibilidad, toca los días que puedes trabajar. La oficina los ve cuando escoge el equipo para una mudanza.'],
      ['Consigue trabajos', 'Los trabajos abiertos aparecen en Buscar trabajo y tú tomas los que quieras. La oficina también puede ofrecerte un trabajo, y tú lo aceptas o no.'],
      ['Haz la mudanza', 'Ese día la app te da direcciones, la dirección y la hora de llegada. Marcas tu entrada y salida, sigues la lista de trabajo y tomas fotos si algo se daña.'],
      ['Recibe tu pago', 'Se te paga después de cada trabajo. Mis ganancias muestra cada trabajo, tu pago, tus propinas y lo que falta por pagar.'],
    ],
    needTitle: 'Qué necesitas',
    needs: ['Tener 18 años o más y una identificación con foto', 'Poder cargar muebles y cajas pesadas', 'Ser puntual, amable y cuidadoso en casa de los clientes', 'Un teléfono inteligente'],
    start: '¿Listo? Crea tu cuenta abajo. (Después, en Perfil puedes poner la app en español.)',
  },
}

// What crew work is like and how the app works, above the sign-up form at /join
export default function JoinPitch() {
  const [lang, setLang] = useState<Lang>(() => (navigator.language?.startsWith('es') ? 'es' : 'en'))
  const c = TEXT[lang]
  return (
    <div className="join-pitch">
      <div className="segmented">
        <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
        <button className={lang === 'es' ? 'on' : ''} onClick={() => setLang('es')}>Español</button>
      </div>
      <section className="card">
        <h2>{c.title}</h2>
        <p>{c.intro}</p>
        <ul className="join-perks">{c.perks.map((p) => <li key={p}>{p}</li>)}</ul>
      </section>
      <section className="card">
        <h3>{c.howTitle}</h3>
        <ol className="join-steps">
          {c.steps.map(([title, text]) => <li key={title}><strong>{title}</strong><span className="muted small">{text}</span></li>)}
        </ol>
      </section>
      <section className="card">
        <h3>{c.needTitle}</h3>
        <ul className="join-perks">{c.needs.map((n) => <li key={n}>{n}</li>)}</ul>
      </section>
      <p className="join-start"><strong>{c.start}</strong></p>
    </div>
  )
}
