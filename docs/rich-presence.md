# Guildora Rich Presence

Guildora Desktop exposes a small local RPC endpoint for games and media apps. It
uses the Windows named pipe `\\.\pipe\guildora-rich-presence`; activity data is
then published through the signed-in Guildora session. The pipe never accepts
account credentials or Guildora access tokens.

Messages are UTF-8 JSON objects separated by a newline. A frame is limited to
16 KiB.

## Set an activity

```json
{"command":"SET_ACTIVITY","clientId":"your-application-id","activity":{"type":"playing","name":"Example Game","details":"Ranked match","state":"In a party","startedAt":1785942000000,"party":{"id":"lobby-42","currentSize":2,"maxSize":5},"buttons":[{"label":"Website","url":"https://example.com"}],"joinSecret":"short-lived-lobby-token"}}
```

Supported types are `playing`, `streaming`, `listening`, `watching` and
`competing`. Optional asset fields are `largeImage`, `largeText`, `smallImage`
and `smallText`. HTTP(S) image URLs are rendered in the profile; other values
can be used as application-specific asset keys.

Guildora replies with `{"ok":true}`. Send `{"command":"CLEAR_ACTIVITY"}` or
close the pipe connection to clear the integration activity. If automatic game
detection is enabled, Guildora falls back to the detected game.

## Join callbacks

When another user presses **Beitreten**, the matching local application
receives:

```json
{"event":"ACTIVITY_JOIN","secret":"short-lived-lobby-token"}
```

The game is responsible for validating the secret and joining the correct
lobby. Join secrets are kept only in server memory, never included in public
presence payloads, and expire with the activity heartbeat.

## Performance and privacy

Automatic detection runs locally every 15 seconds through the Windows process
list and publishes only a matched display name. The full process list never
leaves the device. Network updates happen only when the activity changes plus
one lightweight heartbeat every 45 seconds. Users can disable both publication
and automatic detection independently in **Einstellungen → Aktivitätsstatus**.
