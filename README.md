# Encounter of Many Things Importer

Foundry VTT module for importing Actor JSON files exported by Encounter of Many Things.

## Install From Manifest URL

Use this manifest URL in Foundry's setup screen under **Add-on Modules > Install Module**:

```text
https://github.com/ranetsu/encounter-of-many-things-foundry-importer/releases/latest/download/module.json
```

## Use

1. Export a Foundry Actor JSON from Encounter of Many Things.
2. In Foundry, open the Actors directory.
3. Click **Import EoMT Actor**, or right-click any Actor and choose **Import Encounter of Many Things Actor**.
4. Select the exported JSON file.

The module creates a new NPC Actor and fixes embedded spellcasting activity UUIDs so actions such as Spellcasting and Divine Aid point at the spells embedded in the created Actor.

You can also run this in the Foundry console:

```js
game.eomtImporter.open()
```

If you already imported an Actor through the default Foundry import and need to repair it:

```js
await game.eomtImporter.fixSpellcasting(game.actors.getName("Evil Mage"))
```

## Release

Tag releases as `v0.1.0`, `v0.2.0`, and so on. The GitHub Actions workflow packages the module and uploads:

- `module.json`
- `encounter-of-many-things-importer.zip`
