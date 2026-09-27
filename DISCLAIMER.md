# LEGAL DISCLAIMER & TERMS OF USE / AVISO LEGAL Y CONDICIONES DE USO

> **IMPORTANT / IMPORTANTE**  
> Please read this document carefully before downloading, compiling, installing, or using TauriMule. By using this software, you expressly agree to all terms and conditions set forth herein.  
> *Por favor, lea este documento detenidamente antes de descargar, compilar, instalar o utilizar TauriMule. El uso de este software implica la aceptación expresa de todas las condiciones aquí expuestas.*

---

## 🇪🇸 AVISO LEGAL Y EXENCIÓN TOTAL DE RESPONSABILIDAD (ESPAÑOL)

### 1. Naturaleza del Software: Exclusivamente una Interfaz de Usuario (UI)
**TauriMule es única y exclusivamente un frontend gráfico (GUI / Interfaz de Usuario)** desarrollado de forma independiente utilizando tecnologías de código abierto (Tauri v2, Rust y TypeScript).
- **El núcleo de red P2P sigue siendo aMule (`amuled`) tal cual:** TauriMule no implementa ni modifica los algoritmos de red peer-to-peer descentralizados (protocolos eDonkey2000 y Kad).
- La comunicación entre la interfaz gráfica TauriMule y el demonio aMule se realiza mediante el protocolo estándar de Conexiones Externas (**External Connection / EC Protocol** sobre el puerto local `4712`), de forma análoga a clientes tradicionales como `amulecmd`, `amulegui` o la interfaz web oficial de aMule.
- TauriMule no altera, no filtra, no almacena en servidores propios ni manipula en modo alguno el tráfico de red, los paquetes de transferencia, las listas de nodos Kad ni las conexiones establecidas por el demonio aMule.

### 2. Inexistencia de Alojamiento, Indexación o Distribución de Contenidos
- **TauriMule y sus desarrolladores NO alojan, NO indexan, NO recopilan, NO promueven y NO distribuyen ningún tipo de archivo o contenido multimedia, ejecutable, documento o propiedad intelectual.**
- Ni los creadores de TauriMule ni el repositorio del software operan servidores eD2K, nodos Kad ni trackers.
- La red eD2K y la red Kad son redes P2P totalmente públicas y descentralizadas entre usuarios de todo el mundo, fuera del control o ámbito del autor de TauriMule.

### 3. Responsabilidad Exclusiva del Usuario Final
- El usuario final es el **único y exclusivo responsable** de cualquier búsqueda, consulta de red, descarga, subida, compartición, almacenamiento o uso que realice mediante este software.
- El usuario asume la obligación de conocer, respetar y cumplir estrictamente la legislación vigente en su país o jurisdicción en materia de propiedad intelectual, derechos de autor, privacidad, telecomunicaciones y cualquier otra ley aplicable.
- El autor de TauriMule condena el uso no autorizado de software o redes para infringir derechos de propiedad intelectual y no promueve, tolera ni incentiva la descarga de material protegido sin autorización expresa de sus legítimos titulares.

### 4. Exclusión Absoluta de Garantía y Limitación de Responsabilidad
- ESTE SOFTWARE SE PROPORCIONA "TAL CUAL" (*AS IS*), SIN GARANTÍAS DE NINGÚN TIPO, YA SEAN EXPRESAS O IMPLÍCITAS, INCLUYENDO PERO SIN LIMITARSE A LAS GARANTÍAS DE COMERCIABILIDAD, ADECUACIÓN A UN FIN PARTICULAR O NO INFRACCIÓN.
- **BAJO NINGUNA CIRCUNSTANCIA EL AUTOR, DESARROLLADORES O CONTRIBUIDORES DE TAURIMULE SERÁN RESPONSABLES ANTE EL USUARIO O TERCEROS POR NINGÚN DAÑO DIRECTO, INDIRECTO, INCIDENTAL, ESPECIAL, PUNITIVO O EMERGENTE**, NI POR RECLAMACIONES JUDICIALES, SANCIONES ADMINISTRATIVAS, PÉRDIDA DE DATOS O INFRACCIONES DE DERECHOS DE AUTOR DERIVADAS DEL USO, MAL USO O INCAPACIDAD DE USO DE ESTE SOFTWARE O DE LAS REDES P2P CONECTADAS.
- El usuario acepta mantener indemne al autor frente a cualquier reclamación, demanda, sanción o coste legal derivado del uso que haga del programa.

### 5. Marcas y Licencias de Terceros
- `eMule`, `aMule`, `Tauri`, `Rust` y otros nombres o marcas registradas pertenecen a sus respectivos autores, proyectos y organizaciones comunitarias.
- aMule es software libre distribuido bajo la licencia GNU General Public License (GPL). TauriMule es un proyecto independiente desarrollado sin vinculación oficial con el equipo de eMule ni con aMule.

---

## 🇬🇧 LEGAL DISCLAIMER & LIMITATION OF LIABILITY (ENGLISH)

### 1. Software Nature: Exclusively a Graphical User Interface (UI)
**TauriMule is strictly an independent, third-party Graphical User Interface (GUI) frontend** built with modern open-source technologies (Tauri v2, Rust, and TypeScript).
- **The underlying P2P core engine remains official aMule (`amuled`) as-is:** TauriMule does not write or modify peer-to-peer network routing, cryptographic handshakes, or protocol specifications of the eDonkey2000 (eD2K) or Kademlia (Kad) networks.
- Inter-process communication occurs strictly through aMule's standard **External Connection (EC) protocol** (typically on local TCP port `4712`), behaving identically to official remote tools such as `amulecmd`, `amulegui`, or `amuleweb`.
- TauriMule does not inspect, proxy, log, relay, or tamper with network packets, node tables, or file transfers handled by `amuled`.

### 2. No Content Hosting, Indexing, or Distribution
- **TauriMule and its authors DO NOT host, index, curate, track, store, or distribute any files, digital assets, or copyrighted materials.**
- Neither TauriMule nor its repository operates any eD2k servers, Kad boot nodes, or network infrastructure.
- The eD2k and Kad networks are open, global, decentralized peer-to-peer systems operated by independent third-party users and operators worldwide, wholly outside the control or jurisdiction of the author of this software.

### 3. Sole Responsibility of the End User
- The end user bears **sole and unshared legal responsibility** for any and all search queries, connections, downloads, uploads, or sharing actions performed using this software.
- Users are solely obligated to ensure their activities comply with all applicable local, national, and international laws, including copyright and intellectual property rights in their respective jurisdiction.
- The developers of TauriMule explicitly condemn unauthorized copyright infringement and do not endorse, encourage, or facilitate downloading copyrighted works without permission from rightsholders.

### 4. Warranty Disclaimer & Complete Limitation of Liability
- THIS SOFTWARE IS DISTRIBUTED "AS IS", WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
- **IN NO EVENT SHALL THE AUTHORS, COPYRIGHT HOLDERS, OR CONTRIBUTORS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE, OR THE USE, MISUSE, OR OTHER DEALINGS IN THE SOFTWARE.**
- Under no circumstances shall the author be held liable for any statutory penalties, lawsuits, copyright infringement claims, data loss, network outages, or hardware damage arising from the use of this software.
- The user agrees to indemnify and hold harmless the developers of TauriMule from any legal claims, demands, or liabilities arising from the user's operation of the software.

### 5. Third-Party Trademarks and Acknowledgments
- `aMule`, `eMule`, `Tauri`, and related trademarks are properties of their respective owners and communities.
- aMule is released under the GNU General Public License (GPL). TauriMule is an autonomous open-source project and is neither affiliated with nor endorsed by the official eMule or aMule development teams.
