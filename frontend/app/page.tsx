import Link from 'next/link'

const PASOS = [
  {
    numero: '1',
    titulo: 'Explora',
    color: '#a855f7',
    descripcion:
      'Cuenta tu idea en una frase. El sistema detecta con quién deberías hablar — no solo tu usuario final, también proveedores, aliados y posibles bloqueadores — y genera perfiles sintéticos realistas basados en investigación real de mercado.',
  },
  {
    numero: '2',
    titulo: 'Conversa',
    color: '#3b82f6',
    descripcion:
      'Entrevista a cada perfil por chat, voz o videollamada con avatar. El sistema extrae automáticamente qué tarea necesitan resolver, qué sienten al respecto y qué fricciones tienen — sin que tengas que analizar transcripciones a mano.',
  },
  {
    numero: '3',
    titulo: 'Sintetiza',
    color: '#eab308',
    descripcion:
      'Con las entrevistas hechas, un informe resume el problema real detectado, las fricciones y temores más comunes, y si tu idea quedó validada, parcialmente validada, o sin evidencia suficiente.',
  },
  {
    numero: '4',
    titulo: 'Debate',
    color: '#ef4444',
    descripcion:
      'Cinco agentes con roles distintos — negocio, técnico, riesgos, contexto local y más — debaten tu idea citando la evidencia real de las entrevistas, con posturas a favor y en contra. Termina en un árbol de argumentos con una recomendación y un nivel de confianza calculado de forma objetiva, no inventado por la IA.',
  },
]

const BENEFICIOS = [
  {
    icono: '🔍',
    titulo: 'Evidencia real, no opiniones genéricas',
    texto: 'Los perfiles se apoyan en búsquedas de mercado reales, no en suposiciones.',
  },
  {
    icono: '⚖️',
    titulo: 'Confianza calculada, no inventada',
    texto: 'El nivel de confianza final sale de una fórmula reproducible — no es que el modelo "se sienta seguro".',
  },
  {
    icono: '🗣️',
    titulo: 'Conversación real, no un formulario',
    texto: 'Entrevistas por texto, voz o videollamada con avatar y lipsync, como una llamada real de investigación.',
  },
  {
    icono: '👥',
    titulo: 'Varias perspectivas a la vez',
    texto: 'Usuario final, negocio, técnico, legal y riesgos debatiendo tu idea al mismo tiempo.',
  },
]

export default function LandingPage() {
  return (
    <main className="min-h-full bg-gray-950 text-white">

      {/* Nav */}
      <nav className="flex items-center justify-between px-5 md:px-10 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            S
          </div>
          <span className="text-white font-semibold tracking-tight">Synthetic Users</span>
        </div>
        <Link
          href="/login"
          className="text-sm text-gray-300 hover:text-white border border-gray-800 hover:border-gray-600 px-4 py-2 rounded-xl transition"
        >
          Iniciar sesión
        </Link>
      </nav>

      {/* Hero */}
      <section className="px-5 md:px-10 pt-10 md:pt-16 pb-16 md:pb-24 max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-blue-950 border border-blue-800 rounded-full px-4 py-1.5 text-blue-300 text-xs md:text-sm mb-6">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          Sistema multiagente basado en IA
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-5 leading-tight">
          Valida tu idea de negocio<br className="hidden md:block" /> antes de gastar un sol en ella
        </h1>
        <p className="text-gray-400 text-base md:text-lg max-w-2xl mx-auto mb-9 leading-relaxed">
          En vez de buscar y coordinar entrevistas reales durante semanas, conversa con usuarios
          sintéticos generados a partir de datos de mercado reales, y deja que un panel de expertos
          en IA debata la viabilidad de tu idea desde múltiples ángulos — en minutos, no semanas.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/app"
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all duration-200 text-sm"
          >
            Evaluar mi idea →
          </Link>
          <a
            href="#como-funciona"
            className="w-full sm:w-auto text-gray-400 hover:text-white border border-gray-800 hover:border-gray-600 px-8 py-3.5 rounded-xl transition text-sm"
          >
            Ver cómo funciona
          </a>
        </div>
      </section>

      {/* Qué es */}
      <section className="px-5 md:px-10 py-14 md:py-20 border-t border-gray-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">¿Qué es esto exactamente?</h2>
          <p className="text-gray-400 text-sm md:text-base leading-relaxed max-w-2xl mx-auto">
            Antes de construir algo, todo emprendedor debería hablar con usuarios reales para saber
            si el problema que cree resolver existe de verdad. Ese proceso — llamado{' '}
            <em>Customer Discovery</em> — normalmente toma semanas: encontrar a quién entrevistar,
            coordinar llamadas, analizar transcripciones. Este sistema simula ese proceso completo
            con agentes de IA: genera personas sintéticas realistas para "entrevistar", extrae
            insights automáticamente, y termina con un panel de expertos debatiendo si tu idea
            vale la pena — todo en una sola sesión.
          </p>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="px-5 md:px-10 py-14 md:py-20 border-t border-gray-900">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-3">Cómo funciona, en 4 pasos</h2>
          <p className="text-gray-500 text-sm text-center mb-12 max-w-xl mx-auto">
            Todo el flujo ocurre en una sola conversación con el sistema, de principio a fin.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            {PASOS.map(p => (
              <div
                key={p.numero}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-6"
                style={{ borderTopWidth: 3, borderTopColor: p.color }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ background: `${p.color}22`, color: p.color, border: `1.5px solid ${p.color}55` }}
                  >
                    {p.numero}
                  </span>
                  <h3 className="text-white font-semibold text-lg">{p.titulo}</h3>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed">{p.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Beneficios */}
      <section className="px-5 md:px-10 py-14 md:py-20 border-t border-gray-900">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">Por qué es distinto a preguntarle a un chatbot</h2>
          <div className="grid sm:grid-cols-2 gap-5">
            {BENEFICIOS.map(b => (
              <div key={b.titulo} className="flex gap-4">
                <div className="w-11 h-11 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center text-xl flex-shrink-0">
                  {b.icono}
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1">{b.titulo}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{b.texto}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="px-5 md:px-10 py-16 md:py-24 border-t border-gray-900">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-bold mb-4">¿Listo para poner a prueba tu idea?</h2>
          <p className="text-gray-400 text-sm md:text-base mb-8">
            No necesitas nada preparado — solo cuéntala como si se la explicaras a un amigo.
          </p>
          <Link
            href="/app"
            className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-semibold px-10 py-4 rounded-xl transition-all duration-200 text-sm"
          >
            Evaluar mi idea →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-5 md:px-10 py-8 border-t border-gray-900 text-center">
        <p className="text-gray-600 text-xs">Synthetic Users · Sistema multiagente de evaluación de ideas de negocio</p>
      </footer>

    </main>
  )
}
