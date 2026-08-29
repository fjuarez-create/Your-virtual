/**
 * Catálogo DEMO — productos de ejemplo para que el buscador funcione de punta
 * a punta antes de tener aprobados los programas de afiliación. Cada producto
 * enlaza al buscador público de su tienda. Cuando los adaptadores live estén
 * activos, estos resultados desaparecen solos (ver src/lib/stores/registry.ts).
 */

export interface DemoProduct {
  id: string;
  storeId: string;
  title: string;
  description: string;
  price: number;
  oldPrice?: number;
  emoji: string;
  category: string;
  color?: string;
  brand?: string;
  tags: string;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  // ——— Moda ———
  { id: 'eci-1', storeId: 'elcorteingles', title: 'Camisa amarilla de lino mujer', description: 'Camisa de lino con corte relajado y botones de nácar, color amarillo suave.', price: 39.95, oldPrice: 49.95, emoji: '👚', category: 'moda', color: 'amarillo', brand: 'Sfera', tags: 'camisa blusa amarilla lino mujer verano' },
  { id: 'eci-2', storeId: 'elcorteingles', title: 'Vestido midi estampado floral', description: 'Vestido midi de manga corta con estampado floral sobre fondo azul.', price: 59.99, emoji: '👗', category: 'moda', color: 'azul', brand: 'Woman El Corte Inglés', tags: 'vestido midi floral azul mujer' },
  { id: 'eci-3', storeId: 'elcorteingles', title: 'Americana entallada azul marino', description: 'Blazer entallada de vestir en azul marino, tejido con lana.', price: 89.0, emoji: '🧥', category: 'moda', color: 'azul', brand: 'Emidio Tucci', tags: 'americana blazer chaqueta azul marino traje' },
  { id: 'shein-1', storeId: 'shein', title: 'Blusa mostaza satinada de manga larga', description: 'Blusa satinada color mostaza con cuello camisero, tallas S-XXL.', price: 12.99, emoji: '👚', category: 'moda', color: 'amarillo', tags: 'blusa camisa mostaza amarilla satinada mujer' },
  { id: 'shein-2', storeId: 'shein', title: 'Camiseta oversize con print retro', description: 'Camiseta unisex de algodón con gráfico retro, corte oversize.', price: 8.5, emoji: '👕', category: 'moda', color: 'blanco', tags: 'camiseta oversize blanca unisex retro' },
  { id: 'shein-3', storeId: 'shein', title: 'Vaqueros wide leg de tiro alto', description: 'Jeans wide leg de tiro alto en azul lavado medio.', price: 24.99, emoji: '👖', category: 'moda', color: 'azul', tags: 'vaqueros jeans wide leg tiro alto azul' },
  { id: 'mango-1', storeId: 'mango', title: 'Camisa amarillo limón oversize', description: 'Camisa oversize de popelín en amarillo limón, botones al tono.', price: 29.99, emoji: '👚', category: 'moda', color: 'amarillo', brand: 'Mango', tags: 'camisa amarilla limon oversize popelin mujer blusa' },
  { id: 'mango-2', storeId: 'mango', title: 'Pantalón de traje wideleg beige', description: 'Pantalón fluido wideleg de vestir en beige claro.', price: 39.99, emoji: '👖', category: 'moda', color: 'beige', brand: 'Mango', tags: 'pantalon traje wideleg beige mujer' },
  { id: 'hm-1', storeId: 'hm', title: 'Camisa amarilla de algodón orgánico', description: 'Camisa regular fit de algodón orgánico en amarillo pastel.', price: 19.99, emoji: '👔', category: 'moda', color: 'amarillo', brand: 'H&M', tags: 'camisa amarilla algodon organico hombre mujer blusa' },
  { id: 'hm-2', storeId: 'hm', title: 'Sudadera con capucha esencial gris', description: 'Sudadera básica con capucha y bolsillo canguro, gris jaspeado.', price: 17.99, emoji: '🧥', category: 'moda', color: 'gris', brand: 'H&M', tags: 'sudadera hoodie capucha gris basica' },
  { id: 'miravia-1', storeId: 'miravia', title: 'Camisa amarilla estampada de verano', description: 'Camisa de viscosa con estampado tropical en tonos amarillos.', price: 16.9, oldPrice: 22.9, emoji: '👕', category: 'moda', color: 'amarillo', tags: 'camisa amarilla estampada tropical verano hombre' },
  { id: 'miravia-2', storeId: 'miravia', title: 'Bolso bandolera acolchado negro', description: 'Bolso bandolera acolchado con cadena, efecto piel, color negro.', price: 21.5, emoji: '👜', category: 'moda', color: 'negro', tags: 'bolso bandolera acolchado negro mujer mochila' },
  { id: 'ebay-1', storeId: 'ebay', title: 'Chaqueta vaquera vintage Levi’s', description: 'Chaqueta vaquera Levi’s original años 90, muy buen estado, talla M.', price: 45.0, emoji: '🧥', category: 'moda', color: 'azul', brand: "Levi's", tags: 'chaqueta vaquera vintage levis segunda mano cazadora' },
  { id: 'etsy-1', storeId: 'etsy', title: 'Collar artesanal de plata con inicial', description: 'Collar de plata de ley con inicial grabada a mano, hecho en España.', price: 28.0, emoji: '💍', category: 'moda', color: 'gris', tags: 'collar artesanal plata inicial personalizado joyeria regalo' },
  { id: 'ali-1', storeId: 'aliexpress', title: 'Camisa hawaiana amarilla estampada', description: 'Camisa hawaiana de manga corta, estampado piñas sobre amarillo.', price: 9.87, emoji: '👕', category: 'moda', color: 'amarillo', tags: 'camisa hawaiana amarilla estampada verano hombre' },

  // ——— Calzado y deporte ———
  { id: 'dec-1', storeId: 'decathlon', title: 'Zapatillas running Kiprun KS500', description: 'Zapatillas de running con amortiguación para entrenamientos diarios.', price: 59.99, emoji: '👟', category: 'calzado', color: 'azul', brand: 'Kiprun', tags: 'zapatillas running deportivas correr sneakers hombre mujer' },
  { id: 'dec-2', storeId: 'decathlon', title: 'Bicicleta de montaña Rockrider ST100', description: 'MTB 27,5" con 21 velocidades, ideal para iniciarse en montaña.', price: 279.99, emoji: '🚲', category: 'deporte', brand: 'Rockrider', tags: 'bicicleta bici montaña mtb rockrider' },
  { id: 'dec-3', storeId: 'decathlon', title: 'Tienda de campaña 2 personas 2 Seconds', description: 'Tienda de montaje instantáneo para 2 personas, impermeable.', price: 89.99, emoji: '⛺', category: 'deporte', brand: 'Quechua', tags: 'tienda campaña camping quechua 2 personas' },
  { id: 'spr-1', storeId: 'sprinter', title: 'Zapatillas trail para hombre', description: 'Zapatillas de trail running con suela de agarre multiterreno.', price: 39.99, oldPrice: 54.99, emoji: '👟', category: 'calzado', color: 'negro', tags: 'zapatillas trail running deportivas hombre sneakers' },
  { id: 'spr-2', storeId: 'sprinter', title: 'Camiseta técnica de entrenamiento amarilla', description: 'Camiseta técnica transpirable amarillo flúor para gimnasio.', price: 9.99, emoji: '👕', category: 'deporte', color: 'amarillo', tags: 'camiseta tecnica amarilla entrenamiento gimnasio running' },
  { id: 'dec-4', storeId: 'decathlon', title: 'Esterilla de yoga confort 8 mm', description: 'Esterilla antideslizante de 8 mm para yoga y pilates.', price: 24.99, emoji: '🧘', category: 'deporte', color: 'morado', tags: 'esterilla yoga pilates antideslizante' },

  // ——— Tecnología ———
  { id: 'pcc-1', storeId: 'pccomponentes', title: 'Portátil gaming 15,6" RTX', description: 'Portátil gaming con gráfica dedicada RTX, 16 GB RAM y SSD de 1 TB.', price: 999.0, oldPrice: 1149.0, emoji: '💻', category: 'tecnologia', brand: 'MSI', tags: 'portatil laptop gaming rtx ordenador notebook' },
  { id: 'pcc-2', storeId: 'pccomponentes', title: 'SSD NVMe 1 TB Gen4', description: 'Unidad SSD NVMe PCIe 4.0 de 1 TB, lectura hasta 7.000 MB/s.', price: 79.9, emoji: '💾', category: 'tecnologia', brand: 'Samsung', tags: 'ssd nvme disco duro 1tb almacenamiento' },
  { id: 'pcc-3', storeId: 'pccomponentes', title: 'Teclado mecánico inalámbrico 75%', description: 'Teclado mecánico compacto 75% con switches red y RGB.', price: 64.99, emoji: '⌨️', category: 'tecnologia', tags: 'teclado mecanico inalambrico keyboard gaming rgb' },
  { id: 'mm-1', storeId: 'mediamarkt', title: 'Auriculares inalámbricos con cancelación', description: 'Auriculares over-ear Bluetooth con cancelación activa de ruido.', price: 199.0, oldPrice: 249.0, emoji: '🎧', category: 'tecnologia', color: 'negro', brand: 'Sony', tags: 'auriculares cascos inalambricos bluetooth cancelacion ruido sony' },
  { id: 'mm-2', storeId: 'mediamarkt', title: 'Televisor OLED 55" 4K', description: 'Smart TV OLED de 55 pulgadas 4K con Dolby Vision y 120 Hz.', price: 1099.0, emoji: '📺', category: 'tecnologia', brand: 'LG', tags: 'televisor tv oled 55 pulgadas 4k smart tele' },
  { id: 'mm-3', storeId: 'mediamarkt', title: 'Smartphone 5G 256 GB', description: 'Móvil 5G con pantalla AMOLED de 6,6", 256 GB y triple cámara.', price: 449.0, emoji: '📱', category: 'tecnologia', brand: 'Samsung', tags: 'movil smartphone telefono 5g android samsung' },
  { id: 'wor-1', storeId: 'worten', title: 'Freidora de aire 5,5 L', description: 'Airfryer de 5,5 litros con 8 programas y cesta antiadherente.', price: 59.99, oldPrice: 79.99, emoji: '🍟', category: 'hogar', brand: 'Cosori', tags: 'freidora aire airfryer cocina cosori' },
  { id: 'wor-2', storeId: 'worten', title: 'Monitor 27" QHD 165 Hz', description: 'Monitor gaming de 27 pulgadas QHD con 165 Hz y 1 ms.', price: 219.0, emoji: '🖥️', category: 'tecnologia', tags: 'monitor pantalla qhd gaming 27 pulgadas' },
  { id: 'fnac-1', storeId: 'fnac', title: 'Cámara mirrorless con objetivo 16-50 mm', description: 'Cámara sin espejo APS-C con kit 16-50 mm, vídeo 4K.', price: 749.0, emoji: '📷', category: 'tecnologia', brand: 'Sony', tags: 'camara mirrorless fotografia sony objetivo' },
  { id: 'fnac-2', storeId: 'fnac', title: 'Vinilo — clásicos del soul remasterizados', description: 'LP recopilatorio de soul clásico remasterizado, 180 g.', price: 24.99, emoji: '🎵', category: 'libros', tags: 'vinilo lp musica soul disco' },
  { id: 'ebay-2', storeId: 'ebay', title: 'iPhone 13 128 GB reacondicionado', description: 'iPhone 13 reacondicionado grado A con garantía de 12 meses.', price: 389.0, emoji: '📱', category: 'tecnologia', brand: 'Apple', tags: 'iphone movil smartphone apple reacondicionado segunda mano' },
  { id: 'ebay-3', storeId: 'ebay', title: 'Consola retro con 620 juegos', description: 'Mini consola retro con dos mandos y 620 juegos clásicos.', price: 25.5, emoji: '🕹️', category: 'tecnologia', tags: 'consola retro videojuegos mini clasica' },
  { id: 'ali-2', storeId: 'aliexpress', title: 'Auriculares TWS con estuche de carga', description: 'Auriculares true wireless con Bluetooth 5.3 y estuche de carga.', price: 12.34, emoji: '🎧', category: 'tecnologia', color: 'blanco', tags: 'auriculares tws earbuds inalambricos bluetooth cascos' },
  { id: 'ali-3', storeId: 'aliexpress', title: 'Dron plegable con cámara 4K', description: 'Dron plegable con cámara 4K, dos baterías y modo sígueme.', price: 45.99, emoji: '🚁', category: 'tecnologia', tags: 'dron drone camara 4k plegable' },
  { id: 'ali-4', storeId: 'aliexpress', title: 'Funda de silicona para móvil', description: 'Funda de silicona líquida antigolpes, varios colores.', price: 2.99, emoji: '📱', category: 'tecnologia', tags: 'funda carcasa movil silicona' },
  { id: 'pcc-4', storeId: 'pccomponentes', title: 'Smartwatch deportivo con GPS', description: 'Reloj inteligente con GPS, pulsómetro y 14 días de batería.', price: 129.0, emoji: '⌚', category: 'tecnologia', tags: 'smartwatch reloj inteligente gps deportivo' },

  // ——— Hogar y bricolaje ———
  { id: 'lm-1', storeId: 'leroymerlin', title: 'Taladro percutor 18 V con 2 baterías', description: 'Taladro percutor a batería 18 V con maletín y 2 baterías.', price: 119.0, emoji: '🛠️', category: 'bricolaje', brand: 'Bosch', tags: 'taladro percutor bateria bosch atornillador herramienta' },
  { id: 'lm-2', storeId: 'leroymerlin', title: 'Pintura pared interior blanca 10 L', description: 'Pintura plástica lavable blanco mate para interior, 10 litros.', price: 32.95, emoji: '🎨', category: 'bricolaje', color: 'blanco', tags: 'pintura pared blanca interior mate plastica' },
  { id: 'lm-3', storeId: 'leroymerlin', title: 'Lámpara de pie arqueada dorada', description: 'Lámpara de pie con brazo arqueado y acabado dorado.', price: 79.99, emoji: '💡', category: 'hogar', color: 'amarillo', tags: 'lampara pie dorada arqueada salon luz' },
  { id: 'mano-1', storeId: 'manomano', title: 'Caseta de jardín de madera 5 m²', description: 'Caseta de madera tratada de 5 m² con tejado asfáltico.', price: 649.0, emoji: '🏡', category: 'bricolaje', tags: 'caseta jardin madera exterior cobertizo' },
  { id: 'mano-2', storeId: 'manomano', title: 'Cortacésped eléctrico 1.600 W', description: 'Cortacésped eléctrico con ancho de corte de 38 cm y cesta de 45 L.', price: 129.99, emoji: '🌿', category: 'bricolaje', tags: 'cortacesped electrico jardin cesped' },
  { id: 'mano-3', storeId: 'manomano', title: 'Estantería metálica de taller 5 baldas', description: 'Estantería metálica galvanizada, 5 baldas, carga 875 kg.', price: 49.99, emoji: '🗄️', category: 'bricolaje', tags: 'estanteria metalica taller garaje almacenaje' },
  { id: 'car-1', storeId: 'carrefour', title: 'Cafetera espresso automática', description: 'Cafetera superautomática con molinillo integrado y vaporizador.', price: 249.0, oldPrice: 299.0, emoji: '☕', category: 'hogar', brand: 'De’Longhi', tags: 'cafetera espresso automatica cafe delonghi' },
  { id: 'car-2', storeId: 'carrefour', title: 'Aceite de oliva virgen extra 3 L', description: 'AOVE de cosecha propia, formato ahorro de 3 litros.', price: 23.9, emoji: '🫒', category: 'alimentacion', tags: 'aceite oliva virgen extra aove alimentacion' },
  { id: 'car-3', storeId: 'carrefour', title: 'Robot aspirador con mapeo láser', description: 'Robot aspirador y friegasuelos con mapeo láser y app.', price: 189.0, emoji: '🤖', category: 'hogar', tags: 'robot aspirador aspiradora friegasuelos mapeo' },
  { id: 'eci-4', storeId: 'elcorteingles', title: 'Juego de sartenes antiadherentes x3', description: 'Set de 3 sartenes de aluminio forjado aptas para inducción.', price: 49.9, emoji: '🍳', category: 'hogar', tags: 'sartenes antiadherentes induccion cocina set' },

  // ——— Belleza ———
  { id: 'dru-1', storeId: 'druni', title: 'Perfume mujer eau de parfum 100 ml', description: 'Fragancia floral oriental de larga duración, 100 ml.', price: 59.95, oldPrice: 82.0, emoji: '🌸', category: 'belleza', tags: 'perfume colonia fragancia mujer eau de parfum' },
  { id: 'dru-2', storeId: 'druni', title: 'Sérum facial con vitamina C', description: 'Sérum iluminador con vitamina C pura al 15 % y ácido hialurónico.', price: 19.99, emoji: '✨', category: 'belleza', tags: 'serum facial vitamina c crema iluminador' },
  { id: 'pri-1', storeId: 'primor', title: 'Paleta de sombras tonos cálidos', description: 'Paleta de 18 sombras en tonos cálidos mate y shimmer.', price: 14.99, emoji: '🎨', category: 'belleza', tags: 'paleta sombras maquillaje calidos ojos' },
  { id: 'pri-2', storeId: 'primor', title: 'Crema hidratante facial 50 ml', description: 'Crema hidratante con ácido hialurónico para todo tipo de piel.', price: 9.95, emoji: '🧴', category: 'belleza', tags: 'crema hidratante facial hialuronico piel' },

  // ——— Mascotas ———
  { id: 'zoo-1', storeId: 'zooplus', title: 'Pienso para perro adulto 12 kg', description: 'Pienso con pollo y arroz para perros adultos de razas medianas.', price: 39.99, emoji: '🐶', category: 'mascotas', tags: 'pienso perro comida adulto pollo' },
  { id: 'zoo-2', storeId: 'zooplus', title: 'Rascador para gatos con plataformas', description: 'Rascador de 3 alturas con cuevas y plataformas, sisal natural.', price: 54.99, emoji: '🐱', category: 'mascotas', tags: 'rascador gato arbol plataformas sisal' },

  // ——— Libros y ocio ———
  { id: 'fnac-3', storeId: 'fnac', title: 'Novela — premio Planeta último', description: 'La novela ganadora del último premio Planeta, tapa dura.', price: 22.7, emoji: '📚', category: 'libros', tags: 'libro novela premio planeta lectura' },
  { id: 'etsy-2', storeId: 'etsy', title: 'Lámina ilustrada de Madrid A3', description: 'Lámina A3 ilustrada de Madrid impresa en papel de algodón.', price: 18.5, emoji: '🖼️', category: 'hogar', tags: 'lamina ilustracion madrid decoracion pared' },
  { id: 'etsy-3', storeId: 'etsy', title: 'Taza de cerámica personalizada', description: 'Taza artesanal de cerámica esmaltada con nombre personalizado.', price: 15.0, emoji: '☕', category: 'hogar', tags: 'taza ceramica personalizada regalo artesanal' },

  // ——— Bebé y juguetes ———
  { id: 'eci-5', storeId: 'elcorteingles', title: 'Carrito de bebé 3 piezas', description: 'Cochecito trío con capazo, silla y grupo 0 homologado.', price: 499.0, emoji: '🍼', category: 'bebe', tags: 'carrito bebe cochecito trio capazo' },
  { id: 'car-4', storeId: 'carrefour', title: 'Pañales talla 4 pack 144 unidades', description: 'Pack ahorro de pañales talla 4 (9-14 kg), 144 unidades.', price: 27.5, emoji: '🍼', category: 'bebe', tags: 'panales bebe talla 4 pack' },
  { id: 'mira-3', storeId: 'miravia', title: 'Set de construcción 500 piezas', description: 'Juego de construcción compatible de 500 piezas, edad 6+.', price: 19.99, emoji: '🧸', category: 'juguetes', tags: 'juguete construccion piezas bloques niños' },
];
