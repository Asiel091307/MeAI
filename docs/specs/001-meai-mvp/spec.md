# Especificación 001: MVP de MeAI

## Contexto y objetivo

MeAI busca enseñar de forma práctica cómo funciona un sistema RAG. El usuario podrá incorporar documentos PDF personales, extraer su contenido y formular preguntas en un chat que utilice esos documentos como fuente de contexto.

El objetivo del MVP es permitir consultas semánticas sobre todos los documentos procesados, ofrecer respuestas fundamentadas y mostrar las fuentes utilizadas. El sistema no deberá completar respuestas con conocimiento externo cuando los documentos no aporten evidencia suficiente.

## Usuarios

- Usuario individual con conocimientos de programación y nivel principiante en RAG.
- No existen cuentas, roles ni colaboración entre usuarios en el MVP.

## Historias de usuario

- Como usuario, quiero subir PDF con texto o escaneados para consultar su contenido.
- Como usuario, quiero conocer el estado de procesamiento de cada documento.
- Como usuario, quiero hacer preguntas sobre todos mis documentos procesados.
- Como usuario, quiero realizar preguntas de seguimiento durante la misma sesión de chat.
- Como usuario, quiero ver qué documentos y páginas respaldan cada respuesta.
- Como usuario, quiero reintentar documentos cuyo procesamiento haya fallado.
- Como usuario, quiero eliminar o volver a procesar un documento.

## Requisitos funcionales

### RF-1. Incorporación de documentos

El sistema deberá permitir que el usuario incorpore documentos en formato PDF de hasta 10 MB y 100 páginas, incluidos PDF con texto impreso escaneado.

Criterios de aceptación EARS:

- Cuando el usuario seleccione un PDF de hasta 10 MB y no más de 100 páginas, el sistema deberá registrarlo e iniciar su procesamiento, aunque más tarde se detecte que está dañado o protegido.
- Cuando el PDF contenga texto extraíble, el sistema deberá recuperar el texto de cada página conservando su página de origen.
- Cuando el PDF contenga páginas escaneadas, el sistema deberá intentar reconocer texto impreso en español o inglés de cada una conservando su página de origen.
- Si el archivo no es un PDF o supera los 10 MB, el sistema deberá rechazarlo antes de registrarlo e indicar el motivo en español.
- Si el PDF supera las 100 páginas, el sistema deberá rechazarlo sin conservarlo como documento e indicar el límite superado.
- Si el archivo no permite determinar el número de páginas por estar dañado o protegido, el sistema deberá registrarlo como fallido e indicar el motivo.
- Cuando se suban PDF con el mismo nombre o contenido, el sistema deberá tratarlos como documentos independientes.

### RF-2. Estado del procesamiento

El sistema deberá mostrar el estado actual de cada documento.

Criterios de aceptación EARS:

- Mientras un documento esté siendo procesado, el sistema deberá mostrar que sigue en procesamiento y excluirlo de las consultas.
- Cuando todas las páginas produzcan texto legible no vacío, el sistema deberá marcar el documento como disponible y conservar el origen de cada página.
- Si el documento está dañado, protegido, vacío, contiene páginas ilegibles o su procesamiento se interrumpe, el sistema deberá marcarlo como fallido, excluir todo su contenido de consultas e indicar una causa comprensible.
- Mientras un documento esté fallido, el sistema deberá permitir reintentar su procesamiento o eliminarlo.

### RF-3. Consulta semántica

El sistema deberá buscar en todos los documentos disponibles los fragmentos con mayor relación semántica con la pregunta.

Criterios de aceptación EARS:

- Si la pregunta está vacía, contiene solo espacios o supera los 1000 caracteres, el sistema deberá rechazarla con un mensaje explicativo sin iniciar la consulta.
- Cuando el usuario envíe una pregunta de entre 1 y 1000 caracteres no vacía, el sistema deberá buscar los fragmentos más relacionados semánticamente entre todos los documentos disponibles.
- Mientras un documento no esté disponible, el sistema deberá excluirlo de la búsqueda.
- Si no existe ningún documento disponible, el sistema deberá impedir la consulta e indicar que primero debe procesarse un documento.
- Si la búsqueda falla, el sistema deberá informar del error, no generar una respuesta y permitir reintentar la pregunta.

### RF-4. Respuestas fundamentadas

El sistema deberá generar respuestas basadas exclusivamente en los fragmentos recuperados.

Criterios de aceptación EARS:

- Cuando los fragmentos recuperados respalden una respuesta a la pregunta, el sistema deberá responder únicamente con la información respaldada.
- Cuando la respuesta utilice información documental, el sistema deberá identificar para cada afirmación documental el documento y la página o fragmento que la respalda.
- Si los fragmentos recuperados no permiten responder a la pregunta, el sistema deberá decir que no hay información suficiente, sin completar con conocimiento externo ni presentar citas como respaldo de una respuesta inexistente.
- Si responder requiere información de varios documentos, el sistema deberá combinar solo la información respaldada y distinguir las fuentes correspondientes.

### RF-5. Conversación con memoria

El chat deberá permitir preguntas de seguimiento considerando la conversación anterior.

Criterios de aceptación EARS:

- Cuando el usuario formule una pregunta de seguimiento en la misma pestaña, el sistema deberá interpretar las referencias pertinentes usando los mensajes anteriores y volver a buscar evidencia documental vigente.
- Mientras la pestaña permanezca abierta sin recargarse, el sistema deberá conservar el contexto conversacional necesario para entender preguntas relacionadas.
- Cuando el usuario cierre o recargue la pestaña, el sistema deberá terminar esa conversación y no restaurar su historial.
- Mientras se esté atendiendo una pregunta, desde la búsqueda hasta que la respuesta finalice o falle, el sistema deberá impedir enviar otra pregunta.
- Cuando el historial entre en conflicto con los documentos, el sistema deberá priorizar la evidencia documental.
- Si se elimina un documento citado anteriormente, el sistema deberá conservar los mensajes visibles de la sesión, marcar sus citas como no disponibles y no utilizar su contenido para responder preguntas nuevas.

### RF-6. Presentación progresiva de respuestas

El sistema deberá mostrar la respuesta conforme se vaya generando.

Criterios de aceptación EARS:

- Cuando comience la generación de una respuesta, el sistema deberá mostrar el contenido disponible progresivamente.
- Mientras se genere la respuesta, el sistema deberá indicar que la operación continúa en curso.
- Si la generación falla o se interrumpe, el sistema deberá retirar el texto parcial como respuesta válida, indicar que la respuesta falló y permitir reintentar la pregunta.

### RF-7. Listado de documentos

El sistema deberá presentar todos los documentos incorporados y su estado.

Criterios de aceptación EARS:

- Cuando el usuario consulte sus documentos, el sistema deberá mostrar cada documento registrado y su estado.
- Cuando cambie el estado de un documento, el sistema deberá reflejar el nuevo estado.
- Si no existen documentos, el sistema deberá mostrar una indicación clara para incorporar el primero.

### RF-8. Eliminación de documentos

El sistema deberá permitir eliminar un documento y toda la información obtenida de él.

Criterios de aceptación EARS:

- Cuando el usuario solicite eliminar un documento, el sistema deberá pedir confirmación.
- Cuando el usuario confirme la eliminación, el sistema deberá retirar el documento y toda su información procesada de futuras consultas.
- Si se elimina un documento del que depende una consulta o respuesta en curso, el sistema deberá cancelar esa operación, descartar cualquier texto parcial como respuesta válida e informar al usuario.
- Si la eliminación falla, el sistema deberá informar del error y evitar mostrar una eliminación parcial como completada.

### RF-9. Reprocesamiento de documentos

El sistema deberá permitir volver a procesar un documento existente.

Criterios de aceptación EARS:

- Cuando el usuario solicite reprocesar un documento disponible o fallido, el sistema deberá iniciar un nuevo procesamiento y mostrar que está en curso.
- Mientras el reprocesamiento esté en curso, el sistema deberá excluir el documento por completo de nuevas consultas, incluso si existía una versión anterior disponible.
- Si el reprocesamiento termina correctamente, el sistema deberá hacer consultable únicamente la nueva versión completa.
- Si falla el reprocesamiento de un documento previamente disponible, el sistema deberá restaurar la disponibilidad de su versión anterior completa e informar del fallo.
- Si falla el reprocesamiento de un documento ya fallido, el sistema deberá mantenerlo fallido e informar del motivo.
- Si una consulta o respuesta en curso depende de un documento que comienza a reprocesarse, el sistema deberá cancelar esa operación, descartar cualquier texto parcial como respuesta válida e informar al usuario.

## Requisitos no funcionales

- RNF-1. Todos los mensajes dirigidos al usuario deberán estar escritos en español.
- RNF-2. Las respuestas deberán permitir identificar claramente la evidencia documental utilizada.
- RNF-3. Una operación fallida no deberá dejar documentos parcialmente disponibles para consultas ni respuestas incompletas presentadas como válidas.
- RNF-4. El usuario deberá poder distinguir entre documentos disponibles, en procesamiento y fallidos.
- RNF-5. Los documentos y su información procesada deberán permanecer disponibles después de reiniciar la aplicación.
- RNF-6. Cada comportamiento nuevo o corregido deberá contar con al menos un test automatizado; la suite completa deberá pasar antes de integrar cambios.
- RNF-7. El contenido de los documentos personales no deberá mostrarse fuera de las consultas y fuentes solicitadas por el usuario.
- RNF-8. El procesamiento y la generación deberán indicar que continúan en curso hasta concluir o fallar, sin un tiempo máximo garantizado en este MVP.
- RNF-9. El historial de conversación solo deberá permanecer disponible mientras la pestaña esté abierta sin recargarse; la permanencia de documentos no dependerá de esa sesión.

## Casos límite

- Un PDF dañado o protegido se registra como fallido y puede reintentarse o eliminarse; uno que supere 10 MB o 100 páginas se rechaza indicando el límite.
- Un PDF vacío, con alguna página sin texto legible o con escritura manuscrita no reconocible queda fallido y no aporta contenido a consultas.
- Un PDF mixto, con texto extraíble y páginas escaneadas, solo queda disponible si se obtiene texto legible no vacío de todas sus páginas.
- Dos PDF con el mismo nombre o contenido se registran y gestionan por separado.
- Si se elimina un documento citado, sus respuestas anteriores permanecen visibles en la pestaña con citas no disponibles; ninguna nueva respuesta usa su contenido.
- Las preguntas vacías o de más de 1000 caracteres se rechazan; una pregunta sin respaldo documental recibe un reconocimiento de falta de información.
- Una pregunta que requiera varios documentos se responde únicamente con evidencia de cada uno, distinguiendo las fuentes.
- Sin documentos disponibles no se inicia una consulta, incluso si existe una conversación previa.
- Una interrupción del procesamiento deja el documento fallido; una interrupción de la búsqueda o generación no deja una respuesta parcial válida y permite reintentar.
- Durante el reprocesamiento no se consulta el documento; si falla, se restaura la versión previamente disponible, cuando exista.
- Una segunda pregunta se rechaza mientras la primera sigue en búsqueda o generación; puede enviarse al concluir o fallar la primera.

## Fuera de alcance

- Registro, autenticación, cuentas y soporte multiusuario.
- Compartir documentos, conversaciones o enlaces públicos.
- Procesar formatos distintos de PDF.
- Consultar Internet u otras fuentes externas.
- Responder usando conocimiento general no respaldado por los documentos.
- Colaboración en tiempo real.
- Roles, permisos y administración de usuarios.
- Cancelación manual del procesamiento de un documento.
- Garantías de tiempos máximos de procesamiento o respuesta.
- Conservación o recuperación del historial del chat tras cerrar o recargar la pestaña.

## Criterios de finalización

- El usuario puede incorporar PDF de hasta 10 MB y 100 páginas, con texto extraíble o impreso escaneado en español o inglés; los duplicados son independientes.
- Cada documento muestra un estado verificable; los PDF parcialmente ilegibles no quedan disponibles y los fallidos pueden reintentarse.
- Los documentos disponibles pueden consultarse mediante preguntas semánticas.
- La búsqueda considera todos los documentos disponibles y rechaza preguntas vacías o de más de 1000 caracteres.
- Las respuestas se muestran progresivamente y citan el documento y la página o fragmento que sustenta cada afirmación documental; los errores no dejan respuestas parciales válidas.
- Las preguntas de seguimiento consideran el historial hasta cerrar o recargar la pestaña, con una sola pregunta activa por vez.
- La falta de evidencia produce una respuesta explícita sin conocimiento externo.
- Los documentos fallidos pueden reintentarse o eliminarse.
- Los documentos pueden eliminarse y reprocesarse sin dejar información inconsistente; los mensajes históricos visibles no permiten consultar un documento eliminado.
- Cada comportamiento nuevo o corregido tiene al menos un test automatizado y la suite completa pasa antes de integrar cambios.
- Todos los criterios de aceptación aplicables están satisfechos.

## Dudas abiertas

No quedan dudas funcionales pendientes para este MVP.
