# Estándares de Diseño UI - Formularios MediTrack

## Principios de Diseño
Para mantener la coherencia visual en toda la aplicación, todos los formularios deben implementar el estándar "Premium". Esto garantiza una experiencia de usuario (UX) óptima con un diseño moderno, transiciones suaves y estados de enfoque claros.

Se ha centralizado el diseño en el archivo `src/app/globals.css`.

## Clases CSS Estándar

### 1. Etiquetas de Campos (`.form-label-premium`)
Siempre usa esta clase para las etiquetas (`<label>`) de los inputs. Asegura el color de marca, una tipografía estructurada (en mayúsculas) y la separación correcta.

### 2. Contenedor de Inputs (`.form-input-wrapper`)
Este contenedor debe envolver cada input, especialmente si el input contiene un icono o botón dentro. Habilita el posicionamiento relativo (`position: relative`).

### 3. Iconos Internos (`.input-icon`)
Si incluyes un emoji o icono dentro del input de texto, envuélvelo en una etiqueta `<span>` o `<div>` con esta clase.

### 4. Campos de Entrada (`.form-input-premium`)
Aplica esta clase a todos los `<input>` (texto, email, teléfono, password) y a los `<select>`. Define el borde redondeado (`16px`), el padding amplio, la fuente del sistema (`system-ui`) y las transiciones automáticas para los estados interactivos (`onFocus` y `onBlur`). 
*Ya no se requieren atributos en línea de estilos en React.*

### 5. Botones de Formulario (`.form-btn-premium`)
Usa esta clase para el botón principal de "Enviar" o "Guardar" del formulario. Incluye un fondo degradado con los colores de marca, elevación por sombra y un efecto dinámico en los estados `:hover` y `:active`.

### 6. Toggle de Contraseña (`.form-password-toggle`)
Para los botones que muestran/ocultan la contraseña, aplica esta clase que provee el tamaño cuadrado, el fondo transparente oscuro y un sutil "hover" con color de marca.

---

## Ejemplo de Implementación (React)

```jsx
<div className="form-group">
  <label className="form-label-premium">Correo Electrónico</label>
  <div className="form-input-wrapper">
    <input 
      required 
      type="email" 
      className="form-input-premium"
      placeholder="correo@meditrack.com" 
    />
    <span className="input-icon">📧</span>
  </div>
</div>

<div className="form-group">
  <label className="form-label-premium">Contraseña</label>
  <div className="form-input-wrapper">
    <input 
      required 
      type="password" 
      className="form-input-premium"
      placeholder="Mínimo 6 caracteres" 
    />
    <span className="input-icon">🔐</span>
    <button type="button" className="form-password-toggle">
      👁️
    </button>
  </div>
</div>

<button type="submit" className="form-btn-premium">
  <span>Registrar Usuario</span>
</button>
```

> **Nota:** Con esto logramos que el código sea más limpio, el peso del archivo `.js` sea menor y el diseño siga siendo exactamente el mismo (y fácil de actualizar centralizadamente) en todos los módulos administrativos.
