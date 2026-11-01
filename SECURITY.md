# Güvenlik / Security

## Güvenlik açığı bildirme

PediTree'de bir güvenlik açığı bulduysanız lütfen herkese açık bir "Issue"
açmayın. GitHub'da bu deponun **Security → Report a vulnerability**
bağlantısıyla gizli olarak bildirin. Bildirimler genellikle bir hafta içinde
yanıtlanır. GitHub hesabınız yoksa peditree.app@gmail.com adresine
"Güvenlik" konulu bir e-posta gönderin.

Bildiriminize gerçek hasta bilgisi eklemeyin.

## Reporting a vulnerability

Please do not open a public issue. Report it privately through
**Security → Report a vulnerability** on this repository, or e-mail
peditree.app@gmail.com. Do not include real patient data.

## Kapsam / Scope

PediTree is a static site with no server, database or account: patient data
stays in the browser tab (`sessionStorage`) and leaves it only when the user
downloads or shares a file. The page runs under a strict Content Security
Policy (`public/_headers`) that allows no outside connections.

Relevant reports include, for example: a file opened with "Aç" that runs code
or changes data it should not, patient data written anywhere other than the
tab or a file the user chose, or a way around the Content Security Policy.

Yalnızca en son sürüm desteklenir. / Only the latest release is supported.
