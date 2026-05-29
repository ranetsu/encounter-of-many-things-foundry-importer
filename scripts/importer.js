import {
  strFromU8,
  unzipSync,
} from "../lib/fflate.module.js";

const MODULE_ID =
  "encounter-of-many-things-importer";

class EncounterOfManyThingsImportDialog extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(
      super.defaultOptions,
      {
        id:
          "eomt-import-dialog",
        title:
          "Import Encounter of Many Things Actor",
        template:
          `modules/${MODULE_ID}/templates/import-dialog.hbs`,
        width:
          460,
        height:
          "auto",
        classes: [
          "eomt-importer",
        ],
      }
    );
  }

  activateListeners(html) {
    super.activateListeners(
      html
    );

    html
      .find("[data-action='import']")
      .on(
        "click",
        () => this.#importSelectedFile(
          html
        )
      );
  }

  async #importSelectedFile(html) {
    const fileInput =
      html.find(
        "input[name='actorFile']"
      )[0];
    const file =
      fileInput?.files?.[0];

    if (!file) {
      ui.notifications.warn(
        "Choose an Encounter of Many Things JSON or package file first."
      );
      return;
    }

    try {
      const actors =
        await importEncounterFile(
          file
        );
      const firstActor =
        actors[0];

      ui.notifications.info(
        actors.length === 1
          ? `Imported ${firstActor.name}.`
          : `Imported ${actors.length} Encounter of Many Things actors.`
      );
      firstActor?.sheet?.render(
        true
      );
      this.close();
    } catch (error) {
      console.error(
        `${MODULE_ID} | Import failed`,
        error
      );
      ui.notifications.error(
        "Encounter of Many Things import failed. Check the console for details."
      );
    }
  }
}

async function importEncounterFile(
  file
) {
  const fileName =
    file.name.toLowerCase();

  if (
    fileName.endsWith(
      ".zip"
    ) ||
    fileName.endsWith(
      ".eomt"
    )
  ) {
    return importEncounterPackage(
      file
    );
  }

  const actorData =
    JSON.parse(
      await file.text()
    );
  return [
    await importEncounterActor(
      actorData
    ),
  ];
}

async function importEncounterPackage(
  file
) {
  const entries =
    unzipSync(
      new Uint8Array(
        await file.arrayBuffer()
      )
    );
  const manifestEntry =
    entries["manifest.json"];

  if (!manifestEntry) {
    throw new Error(
      "EoMT package is missing manifest.json."
    );
  }

  const manifest =
    JSON.parse(
      strFromU8(
        manifestEntry
      )
    );

  validatePackageManifest(
    manifest
  );

  await importPackageAssets(
    manifest,
    entries
  );

  const actors = [];

  for (const actorPath of manifest.actors) {
    const actorEntry =
      entries[actorPath];

    if (!actorEntry) {
      throw new Error(
        `EoMT package is missing ${actorPath}.`
      );
    }

    actors.push(
      await importEncounterActor(
        JSON.parse(
          strFromU8(
            actorEntry
          )
        )
      )
    );
  }

  return actors;
}

async function importEncounterActor(
  actorData
) {
  validateActorData(
    actorData
  );

  const sourceData =
    foundry.utils.deepClone(
      actorData
    );

  delete sourceData._id;

  const actor =
    await Actor.create(
      sourceData,
      {
        renderSheet:
          false,
      }
    );

  await fixActorSpellcastingAbility(
    actor
  );
  await fixActorSpellcastingSlots(
    actor
  );
  await fixSpellcastingActivityUuids(
    actor
  );

  return actor;
}

async function fixActorSpellcastingAbility(
  actor
) {
  if (
    actor.system?.attributes?.spellcasting
  ) {
    return;
  }

  const ability =
    inferSpellcastingAbility(
      actor
    );

  if (!ability) {
    return;
  }

  await actor.update(
    {
      "system.attributes.spellcasting":
        ability,
    }
  );
}

async function fixActorSpellcastingSlots(
  actor
) {
  const update = {};
  const currentLevel =
    actor.system?.attributes?.spell?.level ?? 0;
  const profile =
    inferSpellcastingProfile(
      actor
    );

  if (
    profile.level > 0 &&
    !currentLevel
  ) {
    update[
      "system.attributes.spell.level"
    ] =
      profile.level;
  }

  for (const [
    level,
    value,
  ] of Object.entries(
    profile.slots
  )) {
    const path =
      `system.spells.spell${level}`;
    const current =
      actor.system?.spells?.[
        `spell${level}`
      ]?.value ?? 0;

    if (!current) {
      update[
        `${path}.value`
      ] =
        value;
      update[
        `${path}.override`
      ] =
        null;
    }
  }

  if (
    Object.keys(
      update
    ).length
  ) {
    await actor.update(
      update
    );
  }
}

function inferSpellcastingProfile(
  actor
) {
  const profile = {
    level:
      0,
    slots:
      {},
  };

  for (const item of Array.from(
    actor.items
  )) {
    if (
      item.type !== "feat" ||
      !/spellcasting/i.test(
        item.name ?? ""
      )
    ) {
      continue;
    }

    const text =
      stripHtml(
        item.system?.description?.value ?? ""
      );

    profile.level ||= spellcastingLevelFromText(
      text
    );
    Object.assign(
      profile.slots,
      spellSlotsFromText(
        text
      )
    );
  }

  return profile;
}

function spellcastingLevelFromText(
  text
) {
  return Number(
    text.match(
      /\b(\d+)(?:st|nd|rd|th)?(?:-|\s+)level spellcaster\b/i
    )?.[1] ?? 0
  );
}

function spellSlotsFromText(
  text
) {
  const slots = {};

  for (const match of text.matchAll(
    /\b([1-9])(?:st|nd|rd|th)?\s+level\s*\((\d+)\s+slots?\)/gi
  )) {
    slots[match[1]] =
      Number(
        match[2]
      );
  }

  return slots;
}

function inferSpellcastingAbility(
  actor
) {
  for (const item of Array.from(
    actor.items
  )) {
    if (
      item.type !== "feat" ||
      !/spellcasting/i.test(
        item.name ?? ""
      )
    ) {
      continue;
    }

    const ability =
      spellcastingAbilityFromText(
        item.system?.description?.value ?? ""
      );

    if (ability) {
      return ability;
    }
  }

  const spellAbilities =
    Array.from(
      actor.items
    )
      .filter(
        (item) =>
          item.type === "spell" &&
          item.system?.ability
      )
      .map(
        (item) =>
          item.system.ability
      );

  return mostCommon(
    spellAbilities
  );
}

function spellcastingAbilityFromText(
  text
) {
  const plainText =
    stripHtml(
      text
    );
  const match =
    plainText.match(
      /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b(?=[^.;]*(?:spellcasting ability|spell save DC|spell attacks))/i
    ) ??
    plainText.match(
      /uses\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+as (?:its|the) spellcasting ability/i
    );
  const abilityMap = {
    strength:
      "str",
    dexterity:
      "dex",
    constitution:
      "con",
    intelligence:
      "int",
    wisdom:
      "wis",
    charisma:
      "cha",
  };

  return match
    ? abilityMap[
        match[1].toLowerCase()
      ] ?? ""
    : "";
}

function stripHtml(
  text
) {
  const element =
    document.createElement(
      "div"
    );
  element.innerHTML =
    text;
  return element.textContent ?? "";
}

function mostCommon(
  values
) {
  const counts =
    new Map();

  for (const value of values) {
    counts.set(
      value,
      (counts.get(
        value
      ) ?? 0) + 1
    );
  }

  return (
    Array.from(
      counts.entries()
    ).sort(
      (a, b) =>
        b[1] - a[1]
    )[0]?.[0] ?? ""
  );
}

function validateActorData(
  actorData
) {
  if (
    !actorData ||
    typeof actorData !== "object"
  ) {
    throw new Error(
      "Actor JSON must be an object."
    );
  }

  if (
    actorData.type !== "npc"
  ) {
    throw new Error(
      "Only dnd5e NPC Actor JSON files are supported."
    );
  }

  if (
    !Array.isArray(
      actorData.items
    )
  ) {
    throw new Error(
      "Actor JSON does not contain embedded items."
    );
  }
}

function validatePackageManifest(
  manifest
) {
  if (
    !manifest ||
    manifest.format !==
      "encounter-of-many-things-foundry-package" ||
    !Array.isArray(
      manifest.actors
    ) ||
    !Array.isArray(
      manifest.assets
    )
  ) {
    throw new Error(
      "Invalid Encounter of Many Things package manifest."
    );
  }
}

async function importPackageAssets(
  manifest,
  entries
) {
  for (const asset of manifest.assets) {
    if (
      !asset ||
      typeof asset.path !== "string" ||
      typeof asset.file !== "string"
    ) {
      continue;
    }

    const data =
      entries[asset.file];

    if (!data) {
      throw new Error(
        `EoMT package is missing ${asset.file}.`
      );
    }

    await uploadDataFile(
      asset.path,
      data
    );
  }
}

async function uploadDataFile(
  path,
  data
) {
  const normalizedPath =
    path.replace(
      /\\/g,
      "/"
    );

  if (
    normalizedPath.startsWith(
      "/"
    ) ||
    normalizedPath.includes(
      ".."
    )
  ) {
    throw new Error(
      `Unsafe asset path: ${path}`
    );
  }

  const parts =
    normalizedPath.split(
      "/"
    );
  const filename =
    parts.pop();
  const directory =
    parts.join(
      "/"
    );

  if (!filename) {
    return;
  }

  await ensureDataDirectory(
    directory
  );

  const file =
    new File(
      [
        data,
      ],
      filename
    );

  await FilePicker.upload(
    "data",
    directory,
    file,
    {
      notify:
        false,
    }
  );
}

async function ensureDataDirectory(
  directory
) {
  if (!directory) {
    return;
  }

  const parts =
    directory
      .split(
        "/"
      )
      .filter(
        Boolean
      );
  let current =
    "";

  for (const part of parts) {
    current =
      current
        ? `${current}/${part}`
        : part;

    try {
      await FilePicker.createDirectory(
        "data",
        current,
        {
          notify:
            false,
        }
      );
    } catch (error) {
      if (
        !String(
          error?.message ?? error
        ).match(
          /exist/i
        )
      ) {
        throw error;
      }
    }
  }
}

async function fixSpellcastingActivityUuids(
  actor
) {
  const updates =
    Array.from(
      actor.items
    ).flatMap(
      (item) => {
        const itemUpdate = {
          _id:
            item.id,
        };

        for (const [
          activityId,
          activity,
        ] of getActivityEntries(
          item
        )) {
          if (
            activity.type !== "cast"
          ) {
            continue;
          }

          const spellId =
            extractEmbeddedSpellId(
              activity.spell?.uuid
            );
          const spell =
            spellId
              ? actor.items.get(
                  spellId
                )
              : findSpellByActivityName(
                  actor,
                  activity
                );

          if (!spell) {
            continue;
          }

          itemUpdate[
            `system.activities.${activityId}.spell.uuid`
          ] =
            buildEmbeddedSpellUuid(
              actor,
              spell
            );
          itemUpdate[
            `system.activities.${activityId}.name`
          ] =
            spell.name;
        }

        return Object.keys(
          itemUpdate
        ).length > 1
          ? [
              itemUpdate,
            ]
          : [];
      }
    );

  if (updates.length) {
    await actor.updateEmbeddedDocuments(
      "Item",
      updates
    );
  }
}

function getActivityEntries(
  item
) {
  const activities =
    item.system?.activities ?? {};

  if (
    typeof activities.entries === "function"
  ) {
    return Array.from(
      activities.entries()
    );
  }

  return Object.entries(
    activities
  );
}

function buildEmbeddedSpellUuid(
  actor,
  spell
) {
  return `${actor.uuid}.Item.${spell.id}`;
}

function extractEmbeddedSpellId(
  uuid
) {
  if (
    typeof uuid !== "string"
  ) {
    return null;
  }

  return (
    uuid.match(
      /(?:^|\.)(?:Item)\.([A-Za-z0-9]+)$/
    )?.[1] ??
    uuid.match(
      /^([A-Za-z0-9]{16})$/
    )?.[1] ??
    null
  );
}

function findSpellByActivityName(
  actor,
  activity
) {
  const name =
    activity.name?.trim();

  if (!name) {
    return null;
  }

  return actor.items.find(
    (item) =>
      item.type === "spell" &&
      item.name === name
  );
}

Hooks.once(
  "ready",
  () => {
    game.eomtImporter = {
      importActor:
        importEncounterActor,
      fixSpellcasting:
        fixSpellcastingActivityUuids,
      open:
        openImportDialog,
    };

    ui.notifications.info(
      "Encounter of Many Things Importer is ready."
    );
  }
);

function openImportDialog() {
  return new EncounterOfManyThingsImportDialog().render(
    true
  );
}

Hooks.on(
  "getActorDirectoryEntryContext",
  (_html, options) => {
    options.push(
      {
        name:
          "Import Encounter of Many Things Actor",
        icon:
          '<i class="fas fa-file-import"></i>',
        condition:
          () => game.user.isGM,
        callback:
          openImportDialog,
      }
    );
  }
);

Hooks.on(
  "renderActorDirectory",
  (_app, html) => {
    if (!game.user.isGM) {
      return;
    }

    const root =
      getHtmlElement(
        html
      );

    if (!root) {
      return;
    }

    injectActorDirectoryButton(
      root
    );
  }
);

function getHtmlElement(
  html
) {
  if (html instanceof HTMLElement) {
    return html;
  }

  if (html?.[0] instanceof HTMLElement) {
    return html[0];
  }

  return null;
}

function injectActorDirectoryButton(
  root
) {
  if (
    root.querySelector(
      "[data-eomt-import]"
    )
  ) {
    return;
  }

  const button =
    document.createElement(
      "button"
    );

  button.type =
    "button";
  button.dataset.eomtImport =
    "true";
  button.classList.add(
    "eomt-import-button"
  );
  button.innerHTML =
    '<i class="fas fa-file-import"></i> Import EoMT Actor';
  button.addEventListener(
    "click",
    openImportDialog
  );

  const target =
    root.querySelector(
      ".directory-footer"
    ) ??
    root.querySelector(
      ".directory-header"
    ) ??
    root.querySelector(
      "header"
    ) ??
    root;

  target.append(
    button
  );
}

Hooks.on(
  "renderSidebarTab",
  (app, html) => {
    if (
      app?.options?.id !== "actors" ||
      !game.user.isGM
    ) {
      return;
    }

    const root =
      getHtmlElement(
        html
      );

    if (root) {
      injectActorDirectoryButton(
        root
      );
    }
  }
);

Hooks.on(
  "renderActorDirectory",
  (_app, html) => {
    window.setTimeout(
      () => {
        const root =
          getHtmlElement(
            html
          ) ??
          document.querySelector(
            "#actors"
          );

        if (
          root &&
          game.user.isGM
        ) {
          injectActorDirectoryButton(
            root
          );
        }
      },
      100
    );
  }
);
