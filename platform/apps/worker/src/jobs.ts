/**
 * Catálogo de trabajos programados.
 *
 * En la fase 1 están DECLARADOS pero sin implementar: cada uno lanza si se
 * ejecuta, para que nadie confunda «programado» con «hecho». Un trabajo que
 * devuelve silencio sin haber hecho nada es peor que uno que falla.
 */

export interface JobDefinition {
  readonly name: string;
  /** Expresión cron, en UTC. */
  readonly schedule: string;
  readonly description: string;
  /** En qué fase se implementa. */
  readonly plannedPhase: number;
  run(): Promise<void>;
}

function pendiente(name: string, phase: number): () => Promise<void> {
  return async () => {
    throw new Error(
      `El trabajo "${name}" está declarado pero no implementado (previsto para la fase ${phase}).`,
    );
  };
}

export const JOBS: readonly JobDefinition[] = [
  {
    name: 'verificar-cadena-auditoria',
    schedule: '0 3 * * *',
    description:
      'Recorre la cadena de hashes de audit_log y sella el último hash en almacenamiento inmutable. ' +
      'Si detecta un eslabón roto, alguien ha manipulado el registro: alerta inmediata.',
    plannedPhase: 5,
    run: pendiente('verificar-cadena-auditoria', 5),
  },
  {
    name: 'caducar-reservas',
    schedule: '*/15 * * * *',
    description:
      'Marca como caducadas las inversiones que llevan demasiado tiempo sin avanzar y libera su cupo de la ronda.',
    plannedPhase: 4,
    run: pendiente('caducar-reservas', 4),
  },
  {
    name: 'cerrar-periodos-de-reflexion',
    schedule: '*/5 * * * *',
    description:
      'Pasa a pendiente de pago las inversiones cuyo periodo de reflexión ha expirado. ' +
      'Nunca lo acorta: solo actúa cuando cooling_off_ends_at ya ha pasado.',
    plannedPhase: 4,
    run: pendiente('cerrar-periodos-de-reflexion', 4),
  },
  {
    name: 'procesar-webhooks',
    schedule: '* * * * *',
    description:
      'Consume webhook_event sin procesar. Los callbacks nunca se atienden en línea: se persisten y se procesan aquí.',
    plannedPhase: 4,
    run: pendiente('procesar-webhooks', 4),
  },
  {
    name: 'caducar-verificaciones',
    schedule: '0 4 * * *',
    description:
      'Marca como caducados los expedientes de KYC y los tests de idoneidad que superan su plazo de validez.',
    plannedPhase: 3,
    run: pendiente('caducar-verificaciones', 3),
  },
  {
    name: 'recribar-inversores',
    schedule: '0 5 * * 1',
    description:
      'Vuelve a cribar contra listas de PEP y sanciones a los inversores activos. ' +
      'Las listas cambian: una comprobación de hace un año no dice nada de hoy.',
    plannedPhase: 6,
    run: pendiente('recribar-inversores', 6),
  },
  {
    name: 'purgar-datos-caducados',
    schedule: '0 2 * * *',
    description:
      'Borra los documentos cuya retención obligatoria ha vencido y completa las supresiones RGPD que estaban bloqueadas por el plazo de prevención del blanqueo.',
    plannedPhase: 5,
    run: pendiente('purgar-datos-caducados', 5),
  },
  {
    name: 'enviar-comunicaciones',
    schedule: '* * * * *',
    description: 'Envía la cola de correos y registra el resultado en communication_log.',
    plannedPhase: 3,
    run: pendiente('enviar-comunicaciones', 3),
  },
];
