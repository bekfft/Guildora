# Guildora – Phase 6

Guildora ist eine eigenständige Web-Chat-Anwendung im Community-Genre.
Enthalten sind Authentifizierung, Landingpage, eine responsive App-Shell,
Server und Channels, persistente Echtzeit-Nachrichten sowie eine vollständige
Serververwaltung und kontrollierte Servereinladungen.

## Voraussetzungen

- Node.js 22.5 oder neuer (für den integrierten SQLite-Treiber)
- npm
- optional PostgreSQL; ohne `DATABASE_URL` wird automatisch SQLite verwendet

## Einrichtung

```powershell
npm install
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
npm run migrate
npm run dev
```

Registriere anschließend den Besitzer-Account mit dem Benutzernamen `bekfft`.
Danach wird der offizielle Server in einem zweiten Terminal angelegt:

```powershell
npm run seed
```

Danach sind die Anwendungen erreichbar:

- Frontend: `http://localhost:5174`
- API: `http://localhost:3001`
- Healthcheck: `http://localhost:3001/api/health`

## Öffentlicher Zugang

Guildora ist unter `https://bekfft.de` erreichbar. Cloudflare verwaltet den
DNS-Eintrag; Caddy terminiert HTTPS und leitet Web-App und API getrennt an die
lokalen Guildora-Dienste weiter.

Frontend, API und Socket.IO laufen gemeinsam über die Produktionsdomain.

Der Vite-Server leitet HTTP- und WebSocket-Aufrufe unter `/api` an die API weiter. Das
Root-Skript startet Frontend und Backend gemeinsam. Alternativ können beide
Workspaces in getrennten Terminals gestartet werden:

```powershell
npm run dev --workspace server
npm run dev --workspace client
```

## Umgebungsvariablen

Für die lokale SQLite-Entwicklung reichen die Werte aus den Beispieldateien.
In Produktion müssen `JWT_ACCESS_SECRET` und `REFRESH_TOKEN_SECRET` durch
lange, voneinander unabhängige Zufallswerte ersetzt werden. Mit einer gesetzten
`DATABASE_URL` nutzt der Server PostgreSQL statt SQLite.

```env
DATABASE_URL=postgresql://user:password@localhost:5432/guildora
```

Cookies sind httpOnly, verwenden `SameSite=Lax` und werden in Produktion nur
über HTTPS übertragen. Access-Tokens gelten 15 Minuten, Refresh-Tokens 30 Tage.
Refresh-Tokens liegen ausschließlich als HMAC-Hash in der Datenbank und werden
bei jeder Erneuerung rotiert.

## Befehle

```powershell
npm run migrate  # Tabellen anlegen
npm run seed     # Offiziellen Guildora-Server idempotent anlegen
npm run dev      # Client und Server gemeinsam starten
npm run build    # Produktions-Build des Frontends
npm test         # API-Integrationstests
```

`npm run seed` kann beliebig oft ausgeführt werden. Es erzeugt ausschließlich
`Guildora Official` mit den Kategorien Informationen, Community und Support,
allen vorgesehenen Text- und Voice-Channels sowie der internen Basis
`@everyone`. Der bereits registrierte Nutzer `bekfft` wird ausschließlich
Besitzer und erhält keine Rolle. Es werden keine
Demo-Nutzer oder weiteren Demo-Server angelegt. Bestehende echte Nutzer,
Mitgliedschaften und selbst erstellte Server bleiben erhalten.

## Getroffene Entscheidung

SQLite verwendet den in Node.js enthaltenen Treiber und Passwörter werden mit
`bcrypt` (Kostenfaktor 12) gehasht. So ist das geforderte automatische
Fallback-Setup auch auf Systemen ohne native Compiler direkt installierbar.

## App-Routen

- `/app/channels/@me` – Home und Freunde
- `/app/channels/:guildId/:channelId` – Server und ausgewählter Channel
- `/app/discovery` – vom Guildora-Team freigeschaltete Communities entdecken
- `/invite/:code` – öffentliche Einladungsvorschau und Beitritt

Der zuletzt besuchte Channel und eingeklappte Kategorien werden lokal im
Browser gespeichert. Unter 768 Pixeln wird die Server-/Channel-Navigation als
Drawer angezeigt.

## Nachrichten

- Nachrichten werden in SQLite oder PostgreSQL gespeichert.
- Socket.IO verteilt neue, bearbeitete und gelöschte Nachrichten live an
  angemeldete Mitglieder des jeweiligen Channels.
- Eigene Nachrichten können bearbeitet und gelöscht werden.
- Der Verlauf wird seitenweise geladen; der Composer unterstützt Enter zum
  Senden, Shift+Enter für Zeilenumbrüche und lokale Entwürfe pro Channel.
- Inhalte sind auf 2.000 Zeichen begrenzt und das Senden ist serverseitig
  rate-limitiert.

## Serververwaltung

Serverbesitzer und entsprechend berechtigte Rollen erreichen die Verwaltung
über das Servermenü. Die bildschirmfüllende Oberfläche enthält:

- Serverprofil mit Name, Beschreibung und Kategorie
- Kategorien und Text-/Sprach-Channels erstellen, bearbeiten und löschen
- Rollenfarben und fünf getrennte Verwaltungsberechtigungen
- Servernamen und Rollenzuweisungen pro Mitglied
- Mitglieder entfernen, wobei der Serverbesitzer geschützt bleibt

Alle Aktionen verwenden echte API-Endpunkte und werden serverseitig anhand der
Mitgliedschaft und Rollenrechte geprüft. Die Standardrolle und der letzte
Text-Channel können nicht versehentlich gelöscht werden.

Die Discovery-Sichtbarkeit kann nicht durch Serverbesitzer geändert werden.
Nur intern vom Guildora-Team verifizierte und freigeschaltete Server erscheinen
unter „Server entdecken“. Aktuell ist ausschließlich `Guildora Official`
freigegeben; normale neue Server bleiben privat und unsichtbar.

Alle Server verwenden dasselbe Rollenmodell und bestehende Mitgliedschaften
wurden darauf migriert. Der Ersteller ist fest als Eigentümer markiert und
erhält keine Rolle.
Eindeutig vom alten Guildora-Standard erzeugte Admin-/Moderatorrollen wurden
bei dieser Migration ebenfalls entfernt; selbst erstellte Rollen bleiben bestehen.
`@everyone` ist eine interne, nicht zuweisbare Berechtigungsbasis: Jedes
beitretende Mitglied zählt automatisch dazu, erhält aber zunächst keine eigene
Rolle. Mitglieder mit Rollen werden unter ihrer jeweils höchsten Rolle
einsortiert; rollenlose Mitglieder erscheinen anhand ihrer echten
Socket-Verbindung unter Online oder Offline.

## Servereinladungen

Serverbesitzer und Rollen mit „Server verwalten“ können Einladungen direkt über
„Einladen“ im Servermenü oder den Tab „Einladungen“ der Servereinstellungen
erstellen. Ablaufzeit und maximale Nutzungen sind frei aus sicheren Vorgaben
wählbar. Aktive und verbrauchte Links werden mit Ersteller und Nutzungszähler
angezeigt und können jederzeit widerrufen werden.

Einladungen speichern ausschließlich einen zufälligen Code. Der vollständige
Link wird im Browser als `/invite/<code>` unter der aktuell geöffneten Domain
gebildet. Dadurch funktionieren bestehende Codes beim Wechsel von localhost
auf die Produktionsdomain ohne Migration weiter.

Die öffentliche Vorschau zeigt Servername, Beschreibung und Mitgliederzahl.
Nicht angemeldete Besucher kehren nach Login oder Registrierung automatisch zur
Einladung zurück. Der Beitritt zu privaten Servern ist nur mit einer aktiven
Einladung möglich; Nutzungslimit und Ablauf werden serverseitig durchgesetzt.

## Channel-Berechtigungen

Unter jedem Channel gibt es in der Serververwaltung eine an Discord angelehnte
Rechteansicht. Für `@everyone` und jede weitere Rolle können fünf Rechte
dreistufig konfiguriert werden: verweigern, vererben oder erlauben.

Nutzer mit dem Recht „Channels verwalten“ sehen außerdem direkt beim Hover über
einen Channel ein Zahnrad. Es öffnet ohne Umweg die Kanaleinstellungen mit
Übersicht, Berechtigungen und der geschützten Löschaktion.

Ein Rechtsklick auf einen Channel öffnet zusätzlich ein kompaktes Aktionsmenü
zum Bearbeiten oder Löschen. Dasselbe gilt für Kategorien: Sie können direkt
über die Channel-Leiste umbenannt oder gelöscht werden. Beim Löschen einer
Kategorie bleiben ihre Channels erhalten und erscheinen anschließend unter
„Ohne Kategorie“. Die Menüs funktionieren auch über Umschalt+F10 und werden
nur Nutzern mit dem Recht „Channels verwalten“ angezeigt.

Nutzer mit diesem Recht können Channel-Einträge außerdem mit gedrückter
Maustaste auf eine Kategorie ziehen. Das hervorgehobene Ziel übernimmt den
Channel beim Loslassen und speichert die Zuordnung sofort. Beim Ziehen erscheint
ganz oben zusätzlich „Ohne Kategorie ablegen“, sodass sich Channels wieder aus
einer Kategorie lösen lassen.

- Channel anzeigen
- Nachrichtenverlauf lesen
- Nachrichten senden
- Dateien anhängen
- Nachrichten verwalten

Der Schalter „Privater Channel“ sperrt die Sichtbarkeit für `@everyone`;
ausgewählte Rollen können anschließend ausdrücklich Zugriff erhalten. Die
Auswertung erfolgt zentral im Backend und schützt Channel-Liste,
Nachrichtenverlauf, Senden, Löschen fremder Nachrichten und Socket.IO-Beitritte.
Serverbesitzer und Rollen mit Serververwaltung behalten administrativen Zugriff.

## Aktueller Funktionsumfang

- Antworten, Reaktionen, Erwähnungen und Emoji-Auswahl
- Geschützte Bild- und Dateianhänge mit Auswahlvorschau, Bild-Lightbox, Typ, Größe sowie Öffnen/Download
- Live-Typing, Lesestatus, ungelesene Marker und Benachrichtigungen
- Freundschaftsanfragen, Blockierungen und Direktnachrichten
- Servermoderation mit Sperren, Timeouts, Meldungen und Audit-Log
- Voice-Channels mit individueller Nutzerlautstärke, Kamera und Bildschirmfreigabe
- Sprachnachrichten mit Aufnahmevorschau, Dauer und Discord-orientierter Wellenform
- Sichere Linkvorschauen mit serverseitigem Schutz vor internen und privaten Netzwerkzielen
- Eigene Namen, Avatare, Banner und Beschreibungen pro Server
- Serverstatistiken mit 30-Tage-Aktivität, Wachstum, Top-Channels und aktiven Mitgliedern

## Nächste Phase

- Gruppen-Direktnachrichten und Threads
- Mobile Push-Benachrichtigungen
- Digitale Signierung des Windows-Installers

## Voice-Channels

Guildora verwendet LiveKit für verschlüsselte Sprachübertragung. Nutzer können
Voice-Channels betreten, Teilnehmer und aktive Sprecher sehen, Mikrofon und
Wiedergabe stummschalten sowie Ein- und Ausgabegeräte wechseln. Der Server
prüft vor jedem Beitritt die Guild- und Channel-Rechte und stellt anschließend
einen kurzlebigen LiveKit-Token aus; API-Key und API-Secret gelangen nie in den
Browser oder die Desktop-App.

Für die Freischaltung werden im Serverprozess `LIVEKIT_URL`,
`LIVEKIT_API_KEY` und `LIVEKIT_API_SECRET` gesetzt. In Produktion muss die URL
eine vertrauenswürdig TLS-gesicherte `wss://`-Adresse sein. Ohne vollständige
Konfiguration antwortet `/api/voice/status` mit `available: false` und ein
Beitrittsversuch zeigt eine verständliche Fehlermeldung.

Für einen lokalen Integrationstest kann ein LiveKit-Server im Dev-Modus
gestartet und der Server mit den dazugehörigen lokalen Zugangsdaten ausgeführt
werden. Für öffentliche Nutzung sind eine eigene LiveKit-Cloud-Instanz oder ein
öffentlich erreichbarer SFU samt TURN erforderlich; der normale HTTP-Reverse-
Proxy transportiert die WebRTC-Medienports nicht.

## Windows-Desktop-App

Die Electron-App unter `desktop/` ist ein sicherer Rahmen um die gehostete
Guildora-Web-App. Dadurch bleiben httpOnly-Cookies, Login und alle bestehenden
Web-Funktionen auf demselben Origin. Das Frontend wird nicht doppelt gebündelt.

Für GitHub Releases wird bis zu einer späteren Änderung `bekfft/Guildora`
verwendet. Lokal und auf dem Server können `GITHUB_OWNER` und `GITHUB_REPO`
überschrieben werden. Die Remote-Konfiguration liegt in
`desktop-config.json`; der Installer und `latest.yml` liegen ausschließlich bei
GitHub und werden nicht durch den Guildora-Webserver übertragen.

```powershell
# Web-Client auf dem Standard-Port 5173 starten
npm run dev --workspace guildora-client -- --port 5173
npm run desktop:dev

# Windows-Installer und latest.yml lokal erzeugen
npm run desktop:build

# Version erhöhen, veröffentlichen und Release-Assets prüfen
$env:GH_TOKEN = "nur-lokal-setzen"
npm run desktop:release -- patch
```

Der bestehende gemeinsame Entwicklungsstart verwendet weiterhin Port 5174.
Für diesen Fall kann vor `desktop:dev` vorübergehend
`APP_URL=http://localhost:5174` gesetzt werden. Der Standard der Desktop-App
bleibt entsprechend der Release-Konfiguration `http://localhost:5173`.

Die Desktop-App speichert Fensterzustand, Zoom, Einstellungen und die letzte
gültige App-Adresse unter Electron `userData`. Im Produktionsmodus wird die
Remote-Konfiguration beim Start parallel und danach alle 30 Minuten geprüft.
Ungültige oder reine HTTP-Adressen werden weder geladen noch gecacht.

### Releases und Auto-Update

`npm run desktop:build` erzeugt unter `desktop/dist/` den NSIS-Installer
`Guildora-Setup-x.y.z.exe` sowie `latest.yml`. Installiert wird pro Benutzer
ohne Adminrechte. `npm run desktop:release -- patch|minor|major` erhöht die
Desktop-Version, veröffentlicht über `GH_TOKEN` und bricht ab, wenn eines der
beiden erforderlichen Assets fehlt.

Tags im Format `desktop-v1.0.1` starten den Windows-Workflow. Er führt alle
Server- und Desktop-Tests sowie den Client-Build aus und veröffentlicht danach
automatisch ein stabiles Release mit Installer und `latest.yml`. Veröffentlichte
Versionen werden beim App-Start nach drei Sekunden, nach einer wiederhergestellten
Netzwerkverbindung und anschließend alle 30 Minuten geprüft. Updates werden
automatisch heruntergeladen und beim nächsten vollständigen Beenden installiert;
alternativ kann die App über den eingeblendeten Hinweis sofort neu gestartet
werden.

Die erste Fassung ist bewusst noch nicht signiert. Ein OV-Code-Signing-
Zertifikat kostet je nach Anbieter typischerweise einige hundert Euro pro Jahr.
Auch mit einem OV-Zertifikat baut Windows SmartScreen den Ruf erst über reale,
gleichbleibend signierte Downloads auf. Die Downloadseite erklärt deshalb
sachlich, wie die Warnung zu erkennen und manuell zu bestätigen ist. Später
genügen `CSC_LINK` und `CSC_KEY_PASSWORD`; die vorbereiteten Builder-Felder
stehen kommentiert in `desktop/electron-builder.yml`.

### Produktionsdomain

Die öffentliche Guildora-Adresse ist ausschließlich `https://bekfft.de`.
Cloudflare arbeitet als vorgeschalteter Proxy mit dem Modus „Vollständig
(strikt)“; Caddy stellt das gültige Ursprungszertifikat bereit. Client,
API-CORS, Remote-Konfiguration und Desktop-Fallback verwenden dieselbe Domain.
