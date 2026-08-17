/**
 * Datos de arranque.
 *
 * Siembra los parámetros de cumplimiento, los documentos legales, UMAIA con sus
 * cinco activos y su ronda, y dos proyectos relacionados. Es idempotente: se
 * puede ejecutar tantas veces como haga falta.
 *
 * NO crea ningún inversor ni ningún expediente aprobado. Sembrar un inversor
 * con el KYC en verde sería exactamente el atajo que no queremos que exista:
 * los expedientes se aprueban desde el panel, con nombre y apellidos de quien
 * los aprueba.
 *
 * Las cifras de UMAIA son PROVISIONALES y están marcadas como tales: sirven
 * para que la plataforma se pueda recorrer entera. Las definitivas las carga el
 * gestor de proyecto desde el panel.
 */

import {
  type Prisma,
  PrismaClient,
} from '@prisma/client';

import { COMPLIANCE_SETTINGS } from '../../core/src/compliance.js';

const prisma = new PrismaClient();

/** Céntimos a partir de euros enteros, para que el fichero se lea. */
const eur = (euros: number): bigint => BigInt(Math.round(euros * 100));

async function seedComplianceSettings(): Promise<void> {
  for (const setting of Object.values(COMPLIANCE_SETTINGS)) {
    await prisma.complianceSetting.upsert({
      where: { key: setting.key },
      // No se pisa un valor que alguien haya ajustado ya desde el panel.
      update: {},
      create: {
        key: setting.key,
        valueType: setting.valueType,
        value: setting.defaultValue,
        description:
          setting.pendingLegalReview === undefined
            ? setting.description
            : `${setting.description} [PENDIENTE DE VALIDACIÓN LEGAL: ${setting.pendingLegalReview}]`,
        isLocked: setting.locked,
      },
    });
  }
  console.log(`  · ${Object.keys(COMPLIANCE_SETTINGS).length} parámetros de cumplimiento`);
}

/** Huella del contenido: es lo que hace demostrable qué texto aceptó cada inversor. */
async function sha256(text: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const DOCUMENTOS_LEGALES = [
  {
    slug: 'terminos-de-uso',
    kind: 'TERMS_OF_USE' as const,
    name: 'Términos de uso de la plataforma',
    requiresAcceptance: true,
    body: `# Términos de uso

BORRADOR PENDIENTE DE REDACCIÓN POR LA ASESORÍA JURÍDICA.

Este texto es un marcador de posición para que el flujo de aceptación se pueda
probar de extremo a extremo. No tiene valor contractual.`,
  },
  {
    slug: 'politica-de-privacidad',
    kind: 'PRIVACY_POLICY' as const,
    name: 'Política de privacidad',
    requiresAcceptance: true,
    body: `# Política de privacidad

BORRADOR PENDIENTE DE REDACCIÓN POR LA ASESORÍA JURÍDICA.

Debe recoger, como mínimo: responsable del tratamiento, finalidades y bases
jurídicas, plazos de conservación —incluida la retención obligatoria de la
documentación de diligencia debida—, destinatarios (proveedores de verificación
de identidad, firma electrónica y pagos), transferencias internacionales y
ejercicio de derechos.`,
  },
  {
    slug: 'politica-de-cookies',
    kind: 'COOKIES_POLICY' as const,
    name: 'Política de cookies',
    requiresAcceptance: false,
    body: `# Política de cookies

BORRADOR PENDIENTE DE REDACCIÓN POR LA ASESORÍA JURÍDICA.`,
  },
  {
    slug: 'advertencias-de-riesgo',
    kind: 'RISK_WARNINGS' as const,
    name: 'Advertencias de riesgo',
    requiresAcceptance: true,
    body: `# Advertencias de riesgo

BORRADOR PENDIENTE DE VALIDACIÓN POR LA ASESORÍA JURÍDICA.

Invertir en proyectos inmobiliarios a través de esta plataforma conlleva
riesgos relevantes:

- **Riesgo de pérdida total del capital.** No existe garantía de recuperación
  de la inversión, ni total ni parcial.
- **Ausencia de cobertura de fondos de garantía.** La inversión no está cubierta
  por el Fondo de Garantía de Depósitos ni por el Fondo de Garantía de
  Inversiones.
- **Iliquidez.** No existe un mercado secundario: la inversión no puede
  recuperarse a voluntad antes del vencimiento del proyecto.
- **Riesgo de retraso o de no ejecución.** Los plazos de obra y de venta son
  estimaciones y pueden incumplirse.
- **Subordinación.** El capital de los inversores se sitúa por detrás de la
  deuda bancaria en el orden de prelación de cobro.

Las rentabilidades objetivo son proyecciones, no promesas de resultado.`,
  },
  {
    slug: 'contrato-de-inversion',
    kind: 'INVESTMENT_CONTRACT' as const,
    name: 'Contrato de inversión (modelo)',
    requiresAcceptance: true,
    body: `# Contrato de inversión

BORRADOR PENDIENTE DE REDACCIÓN POR LA ASESORÍA JURÍDICA.

No debe utilizarse con inversores reales.`,
  },
];

async function seedLegalDocuments(): Promise<void> {
  for (const doc of DOCUMENTOS_LEGALES) {
    const legalDocument = await prisma.legalDocument.upsert({
      where: { slug: doc.slug },
      update: {},
      create: {
        slug: doc.slug,
        kind: doc.kind,
        name: doc.name,
        requiresAcceptance: doc.requiresAcceptance,
      },
    });

    const existing = await prisma.legalDocumentVersion.findFirst({
      where: { legalDocumentId: legalDocument.id, versionLabel: 'v0.1-borrador' },
    });
    if (existing !== null) continue;

    await prisma.legalDocumentVersion.create({
      data: {
        legalDocumentId: legalDocument.id,
        versionLabel: 'v0.1-borrador',
        locale: 'es-ES',
        contentMd: doc.body,
        contentSha256: await sha256(doc.body),
        effectiveFrom: new Date(),
      },
    });
  }
  console.log(`  · ${DOCUMENTOS_LEGALES.length} documentos legales (borradores)`);
}

async function seedUmaia(): Promise<void> {
  const spv = await prisma.spv.upsert({
    where: { taxId: 'B00000000' },
    update: {},
    create: {
      legalName: 'UMAIA Telde SL (vehículo provisional)',
      taxId: 'B00000000',
      registeredAddress: 'Telde, Las Palmas',
      registryData: 'PENDIENTE — datos registrales por confirmar',
    },
  });

  const project = await prisma.project.upsert({
    where: { slug: 'umaia' },
    update: {},
    create: {
      slug: 'umaia',
      name: 'UMAIA',
      tagline: 'Cuatro edificios residenciales y una parcela terciaria en Telde, Gran Canaria',
      status: 'DRAFT', // Se publica desde el panel, nunca desde un seed.
      assetClass: 'MIXED',
      addressLine: 'Telde',
      city: 'Telde',
      province: 'Las Palmas',
      country: 'ES',
      latitude: '27.9985',
      longitude: '-15.4167',
      descriptionMd: `## El proyecto

UMAIA es un desarrollo residencial en Telde (Gran Canaria) compuesto por cuatro
edificios de vivienda y una parcela de uso terciario resultante de la
urbanización.

La **licencia de urbanización está obtenida**. La parcela terciaria se destina a
venta futura a un operador de supermercado o gastromercado, y constituye una vía
de retorno independiente de la venta de vivienda.

> Contenido provisional. La memoria definitiva la carga el gestor de proyecto
> desde el panel de administración.`,
      targetReturnPct: '14.0',
      returnType: 'TIR',
      termMonths: 36,
      isFeatured: true,
      displayOrder: 0,
      spvId: spv.id,
    },
  });

  const activos: Prisma.ProjectAssetCreateManyInput[] = [
    {
      projectId: project.id,
      assetType: 'RESIDENTIAL_BUILDING',
      name: 'Edificio 1',
      description: 'Edificio residencial plurifamiliar.',
      unitsCount: 40,
      builtSurfaceM2: '3800.00',
      intendedUse: 'Vivienda libre',
      displayOrder: 1,
    },
    {
      projectId: project.id,
      assetType: 'RESIDENTIAL_BUILDING',
      name: 'Edificio 2',
      description: 'Edificio residencial plurifamiliar.',
      unitsCount: 40,
      builtSurfaceM2: '3800.00',
      intendedUse: 'Vivienda libre',
      displayOrder: 2,
    },
    {
      projectId: project.id,
      assetType: 'RESIDENTIAL_BUILDING',
      name: 'Edificio 3',
      description: 'Edificio residencial plurifamiliar.',
      unitsCount: 40,
      builtSurfaceM2: '3800.00',
      intendedUse: 'Vivienda libre',
      displayOrder: 3,
    },
    {
      projectId: project.id,
      assetType: 'RESIDENTIAL_BUILDING',
      name: 'Edificio 4',
      description: 'Edificio residencial plurifamiliar.',
      unitsCount: 40,
      builtSurfaceM2: '3800.00',
      intendedUse: 'Vivienda libre',
      displayOrder: 4,
    },
    {
      projectId: project.id,
      assetType: 'COMMERCIAL_PLOT',
      name: 'Parcela terciaria',
      description:
        'Parcela de uso terciario resultante de la urbanización, destinada a venta a operador de supermercado o gastromercado.',
      plotSurfaceM2: '4500.00',
      intendedUse: 'Terciario — comercial',
      displayOrder: 5,
    },
  ];

  if ((await prisma.projectAsset.count({ where: { projectId: project.id } })) === 0) {
    await prisma.projectAsset.createMany({ data: activos });
  }

  // Orden de prelación: la deuda bancaria cobra antes que los inversores.
  // Es una de las cosas que la web pública tiene obligación de dejar clara.
  if ((await prisma.capitalStackItem.count({ where: { projectId: project.id } })) === 0) {
    await prisma.capitalStackItem.createMany({
      data: [
        {
          projectId: project.id,
          seniority: 1,
          label: 'Deuda bancaria (préstamo promotor)',
          amountCents: eur(6_000_000),
          notes: 'Cobra con preferencia sobre el capital de los inversores. Importe provisional.',
        },
        {
          projectId: project.id,
          seniority: 2,
          label: 'Capital de inversores (financiación participativa)',
          amountCents: eur(2_500_000),
          notes: 'Subordinado a la deuda bancaria. Importe provisional.',
        },
        {
          projectId: project.id,
          seniority: 3,
          label: 'Aportación del promotor',
          amountCents: eur(1_500_000),
          notes: 'Capital del promotor. Importe provisional.',
        },
      ],
    });
  }

  const existingRound = await prisma.fundingRound.findFirst({
    where: { projectId: project.id, roundNumber: 1 },
  });

  const round =
    existingRound ??
    (await prisma.fundingRound.create({
      data: {
        projectId: project.id,
        roundNumber: 1,
        status: 'DRAFT', // La apertura de captación es una decisión del panel.
        targetAmountCents: eur(2_500_000),
        minimumAmountCents: eur(1_500_000),
        minTicketCents: eur(500),
        maxTicketPerInvestorCents: eur(100_000),
        currency: 'EUR',
        platformFeePct: '2.000',
        successFeePct: '1.000',
      },
    }));

  if ((await prisma.returnTier.count({ where: { fundingRoundId: round.id } })) === 0) {
    await prisma.returnTier.createMany({
      data: [
        {
          fundingRoundId: round.id,
          tierOrder: 1,
          label: 'Retorno preferente',
          description:
            'Los inversores perciben la totalidad del beneficio hasta alcanzar un 8 % sobre el capital aportado.',
          hurdlePct: '8.000',
          splitInvestorsPct: '100.000',
          splitSponsorPct: '0.000',
        },
        {
          fundingRoundId: round.id,
          tierOrder: 2,
          label: 'Reparto de plusvalía',
          description: 'El beneficio por encima del retorno preferente se reparte 80/20.',
          hurdlePct: null,
          splitInvestorsPct: '80.000',
          splitSponsorPct: '20.000',
        },
      ],
    });
  }

  if ((await prisma.projectMilestone.count({ where: { projectId: project.id } })) === 0) {
    await prisma.projectMilestone.createMany({
      data: [
        {
          projectId: project.id,
          title: 'Licencia de urbanización obtenida',
          status: 'COMPLETED',
          displayOrder: 1,
        },
        {
          projectId: project.id,
          title: 'Cierre de la ronda de financiación',
          status: 'PLANNED',
          displayOrder: 2,
        },
        {
          projectId: project.id,
          title: 'Inicio de obra',
          status: 'PLANNED',
          displayOrder: 3,
        },
        {
          projectId: project.id,
          title: 'Entrega de los edificios residenciales',
          status: 'PLANNED',
          displayOrder: 4,
        },
        {
          projectId: project.id,
          title: 'Venta de la parcela terciaria',
          status: 'PLANNED',
          displayOrder: 5,
        },
      ],
    });
  }

  console.log('  · UMAIA con 5 activos, 3 tramos de capital, ronda y cascada');
  return;
}

/**
 * Proyectos relacionados. Existen desde el primer día para que el listado de la
 * portada sea una consulta y no un caso especial: cuando Brassie o Serenea
 * entren de verdad, será editar filas.
 */
async function seedRelatedProjects(): Promise<void> {
  const relacionados = [
    {
      slug: 'serenea-apolo',
      name: 'SERENEA · Edificio Apolo',
      tagline: '166 viviendas en Las Huesas, Telde',
      assetClass: 'RESIDENTIAL' as const,
      city: 'Telde',
      status: 'FULLY_FUNDED' as const,
      // Enganche con el showroom 3D que ya vive en la raíz del repositorio.
      showroomUrl: '/',
      displayOrder: 1,
    },
    {
      slug: 'brassie',
      name: 'BRASSIE',
      tagline: 'Proyecto en preparación',
      assetClass: 'RESIDENTIAL' as const,
      city: 'Las Palmas de Gran Canaria',
      status: 'DRAFT' as const,
      showroomUrl: null,
      displayOrder: 2,
    },
  ];

  const umaia = await prisma.project.findUniqueOrThrow({ where: { slug: 'umaia' } });

  for (const datos of relacionados) {
    const proyecto = await prisma.project.upsert({
      where: { slug: datos.slug },
      update: {},
      create: {
        slug: datos.slug,
        name: datos.name,
        tagline: datos.tagline,
        status: datos.status,
        assetClass: datos.assetClass,
        city: datos.city,
        province: 'Las Palmas',
        country: 'ES',
        isFeatured: false,
        displayOrder: datos.displayOrder,
        showroomUrl: datos.showroomUrl,
      },
    });

    await prisma.projectRelation.upsert({
      where: {
        projectId_relatedProjectId: {
          projectId: umaia.id,
          relatedProjectId: proyecto.id,
        },
      },
      update: {},
      create: {
        projectId: umaia.id,
        relatedProjectId: proyecto.id,
        displayOrder: datos.displayOrder,
      },
    });
  }

  console.log(`  · ${relacionados.length} proyectos relacionados`);
}

/** Cuentas del libro mayor que no dependen de una ronda concreta. */
async function seedLedgerAccounts(): Promise<void> {
  for (const cuenta of [
    { code: 'PLATFORM_FEES', type: 'PLATFORM_FEES' as const },
    { code: 'SUSPENSE', type: 'SUSPENSE' as const },
  ]) {
    await prisma.ledgerAccount.upsert({
      where: { code: cuenta.code },
      update: {},
      create: { code: cuenta.code, type: cuenta.type, currency: 'EUR' },
    });
  }
  console.log('  · cuentas del libro mayor');
}

async function main(): Promise<void> {
  console.log('Sembrando datos de arranque…');
  await seedComplianceSettings();
  await seedLegalDocuments();
  await seedUmaia();
  await seedRelatedProjects();
  await seedLedgerAccounts();

  console.log('');
  console.log('Listo. Nota importante:');
  console.log('  · No se ha creado ningún inversor ni ningún expediente de KYC.');
  console.log('  · UMAIA y su ronda quedan en BORRADOR: se publican desde el panel.');
  console.log('  · Los textos legales son borradores sin valor contractual.');
  console.log('  · Las cifras económicas son provisionales.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
