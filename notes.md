**normal HTTP request** -> one way connection every request is separate
Client → Request → Server → Response → Connection closes

**websokets works like this** :
client connects once 
connection stays open 
Client and server can send messages anytime

it's full-duplex communicaton.

that's why it's used for:
chat apps 
live notifications
realtime games
live dashboards

**how our chat system will work** : 
Client connects socket

Client sends: “join-room” with matchId

Server verifies:

Is user part of this match?

If yes → join room

When user sends message:

Save message in DB

Emit to room

Important: **Socket **Authentication****

Socket connections are NOT automatically protected like HTTP.

We must manually verify JWT.

We will:

Send accessToken during socket connection

Verify it in socket middleware

Attach userId to socket

Without this, anyone can connect.
