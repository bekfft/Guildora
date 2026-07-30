# Guildora release policy

Nach jeder abgeschlossenen und ausgelieferten Guildora-Aenderung muss der
vollstaendige Releasepfad ausgefuehrt werden. Eine Aenderung ist erst fertig,
wenn alle folgenden Punkte erfolgreich sind:

1. Server-Tests, Desktop-Tests und Client-Build ausfuehren.
2. Desktop-Version passend per SemVer erhoehen, normalerweise als Patch.
3. Windows-Installer und `latest.yml` frisch bauen.
4. Ein nicht als Entwurf markiertes GitHub-Release
   `desktop-v<version>` unter `bekfft/Guildora` veroeffentlichen.
5. `Guildora-Setup-<version>.exe` und `latest.yml` anhaengen.
6. GitHub-Release, `/api/releases/latest`,
   `/api/download/windows` und die Landingpage-Version live pruefen.
7. Den Guildora-Server nach einem Release neu starten, damit kein alter
   Release-Cache ausgeliefert wird.

Der Electron-Updater muss aktiviert bleiben: automatische Downloads,
Installation beim vollstaendigen Beenden und regelmaessige Update-Pruefungen
duerfen nicht entfernt oder umgangen werden.
