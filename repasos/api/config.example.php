<?php
/**
 * Copia este fichero a config.php en el servidor y rellena los datos.
 * config.php NO se sube al repositorio: lleva credenciales.
 *
 * En Plesk: Bases de datos → Añadir base de datos, y aquí se pegan el
 * nombre, el usuario y la contraseña que te dé el panel.
 */
return [
    'db' => [
        // 'mysql' es lo normal en el hosting. 'sqlite' no necesita
        // servidor de base de datos: guarda todo en un fichero, y para
        // una promoción de 50 viviendas va sobrado.
        'driver'   => 'mysql',

        'host'     => 'localhost',
        'nombre'   => '',
        'usuario'  => '',
        'password' => '',

        // Solo para driver 'sqlite'. La carpeta debe quedar fuera del
        // alcance del navegador (api/datos/ ya lo está por .htaccess).
        'fichero'  => __DIR__ . '/datos/repasos.sqlite',
    ],

    // Usuario administrador que crea install.php la primera vez.
    // Después de instalar, vacía estos tres valores.
    'admin_inicial' => [
        'nombre'   => '',
        'email'    => '',
        'password' => '',
    ],

    // Con HTTPS (lo normal en el subdominio) déjalo en true: la cookie
    // de sesión no viajará nunca por una conexión sin cifrar.
    'cookie_segura' => true,

    // Carpeta donde se guardan fotos, vídeos y audios.
    //
    // 'uploads' (relativa a api/) funciona sin tocar nada más.
    //
    // Más seguro: una ruta ABSOLUTA fuera de httpdocs, p. ej.
    //   '/var/www/vhosts/unikdi.com/repasos.unikdi.com/medios'
    // En Plesk, nginx sirve los ficheros estáticos sin pasar por Apache y
    // se salta los .htaccess; con la carpeta fuera de la zona web, las
    // fotos solo pueden salir por la API, que comprueba la sesión.
    // La ruta exacta la da Plesk en «Hosting» → «Raíz de documentos».
    'carpeta_medios' => 'uploads',

    // Tope por fichero (bytes). El servidor también manda: revisa
    // upload_max_filesize y post_max_size en el PHP del hosting.
    'max_fichero' => 83886080, // 80 MB
];
