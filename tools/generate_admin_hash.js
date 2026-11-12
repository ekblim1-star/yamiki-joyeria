const crypto = require('crypto');
const readline = require('readline');
const { Writable } = require('stream');

/**
 * Generador de hashes seguros para la contraseña de administración de Yamiki Joyería.
 * Estándar OWASP: PBKDF2 con HMAC-SHA512, 210,000 iteraciones y salt criptográfico de 16 bytes.
 */
function generateHash(password) {
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }

  const iterations = 210000;
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512');

  const saltHex = salt.toString('hex');
  const hashHex = derivedKey.toString('hex');

  return `pbkdf2$${iterations}$${saltHex}$${hashHex}`;
}

function verifyHash(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false;
  }
  const iterations = parseInt(parts[1], 10);
  const salt = Buffer.from(parts[2], 'hex');
  const expectedHash = Buffer.from(parts[3], 'hex');

  const actualHash = crypto.pbkdf2Sync(password, salt, iterations, expectedHash.length, 'sha512');
  return crypto.timingSafeEqual(expectedHash, actualHash);
}

/**
 * Entrada interactiva segura que oculta completamente los caracteres en pantalla
 * y previene que la contraseña quede en el historial de comandos (bash/powershell history).
 */
function promptPassword(promptText) {
  return new Promise((resolve) => {
    let muted = false;
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding);
        }
        callback();
      }
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true
    });

    process.stdout.write(promptText);
    muted = true;

    rl.question('', (value) => {
      muted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(value.trim());
    });
  });
}

async function main() {
  // Prohibición estricta de paso de contraseña por argumentos de línea de comandos
  if (process.argv.length > 2) {
    console.error("\n[BLOQUEO DE SEGURIDAD]: Por política de seguridad, no se admiten contraseñas en los argumentos de la terminal.");
    console.error("Ejecuta el script únicamente como: node tools/generate_admin_hash.js\n");
    process.exit(1);
  }

  console.log("==================================================================");
  console.log("  GENERADOR DE CREDENCIALES ADMINISTRATIVAS - YAMIKI JOYERÍA");
  console.log("  (La contraseña se oculta en terminal y no queda registrada)");
  console.log("==================================================================\n");

  const pwd = await promptPassword("Introduce la nueva contraseña de administrador (mínimo 8 caracteres): ");
  if (!pwd || pwd.length < 8) {
    console.error("\n[ERROR]: La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const confirmPwd = await promptPassword("Confirma la contraseña de administrador: ");
  if (pwd !== confirmPwd) {
    console.error("\n[ERROR]: Las contraseñas no coinciden.");
    process.exit(1);
  }

  try {
    const hash = generateHash(pwd);
    console.log("\n=== HASH CRIPTOGRÁFICO PBKDF2 GENERADO EXITOSAMENTE ===");
    console.log("Copia este valor y configúralo en Cloudflare Pages como variable secreta:");
    console.log("Nombre: ADMIN_PASSWORD_PBKDF2\n");
    console.log(hash);
    console.log("\nVerificación de integridad criptográfica:", verifyHash(pwd, hash) ? "VÁLIDA (100% OK)" : "INVÁLIDA");
    console.log("==================================================================\n");
  } catch (err) {
    console.error("Error:", err.message);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { generateHash, verifyHash };
