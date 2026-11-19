/* Métricas de la letra del «Reconocimiento de repasos pendientes».

   La letra es un recorte de Liberation Sans Regular 2.1.5, la gemela
   métrica de Arial (que es con la que está hecho el modelo aprobado). El
   fichero es assets/fonts/liberation-sans-pdf.ttf y su licencia está al
   lado, en LICENCIA-liberation-sans.txt. Por dentro se llama «Repasos
   Sans», porque la licencia reserva el nombre original para la versión
   sin tocar.

   Los anchos van en las unidades de la propia fuente (2048 por cuadratín),
   NO en milésimas: así cada línea mide exactamente lo mismo que en el
   modelo y parte por el mismo sitio. Son los de los códigos 32–255 de
   WinAnsi; un cero es un código sin carácter. Coinciden uno a uno con los
   de Arial.

   Leídas con fonttools de la fuente ya recortada. Sin esto no se puede ni
   centrar un texto ni partirlo en líneas. */

export const TIPOGRAFIA_CONSTANCIA = {
  nombre: 'RepasosSans-Regular',
  unidadesPorEm: 2048,
  primerCodigo: 32,
  anchos: [569,569,727,1139,1139,1821,1366,391,682,682,797,1196,569,682,569,569,1139,1139,1139,1139,1139,1139,1139,1139,1139,1139,569,569,1196,1196,1196,1139,2079,1366,1366,1479,1479,1366,1251,1593,1479,569,1024,1366,1139,1706,1479,1593,1366,1593,1479,1366,1251,1479,1366,1933,1366,1366,1251,569,569,569,961,1139,682,1139,1139,1024,1139,1139,569,1139,1139,455,455,1024,455,1706,1139,1139,1139,1139,682,1024,569,1139,1024,1479,1024,1024,1024,684,532,684,1196,0,1139,0,455,1139,682,2048,1139,1139,682,2048,1366,682,2048,0,1251,0,0,455,455,682,682,717,1139,2048,682,2048,1024,682,1933,0,1024,1366,569,682,1139,1139,1139,1139,532,1139,682,1509,758,1139,1196,682,1509,1131,819,1124,682,682,682,1180,1100,682,682,682,748,1139,1708,1708,1708,1251,1366,1366,1366,1366,1366,1366,2048,1479,1366,1366,1366,1366,569,569,569,569,1479,1479,1593,1593,1593,1593,1593,1196,1593,1479,1479,1479,1479,1366,1366,1251,1139,1139,1139,1139,1139,1139,1821,1024,1139,1139,1139,1139,569,569,569,569,1139,1139,1139,1139,1139,1139,1139,1124,1251,1139,1139,1139,1139,1024,1139,1024],
  // Lo que pide el descriptor del PDF, en milésimas de cuadratín. El
  // ascendente y el descendente son los de la tabla OS/2 (1491 y −431 sobre
  // 2048), los mismos que declara el modelo: de ellos sale el alto de la
  // franja azul cuando alguien selecciona el texto con el dedo.
  ascendente: 728.0273, descendente: -210.4492, mayusculas: 688,
  caja: [-203, -212, 1000, 878], tallo: 87,
};
