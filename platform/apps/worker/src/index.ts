/**
 * Worker de trabajos programados.
 *
 * En la fase 1 solo declara el catálogo y lo imprime al arrancar. El
 * planificador real (BullMQ sobre Redis, o pg_cron) entra con los primeros
 * trabajos implementados, en la fase 3.
 */

import { JOBS } from './jobs.js';

function main(): void {
  console.log('UMAIA · worker de trabajos programados');
  console.log('');
  console.log(`${JOBS.length} trabajos declarados, ninguno implementado todavía:`);
  console.log('');

  for (const job of [...JOBS].sort((a, b) => a.plannedPhase - b.plannedPhase)) {
    console.log(`  fase ${job.plannedPhase}  ${job.schedule.padEnd(12)}  ${job.name}`);
    console.log(`            ${job.description}`);
    console.log('');
  }

  console.log('El planificador se conecta en la fase 3, con los primeros trabajos reales.');
}

main();
