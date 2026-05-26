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
        "input[name='actorJson']"
      )[0];
    const file =
      fileInput?.files?.[0];

    if (!file) {
      ui.notifications.warn(
        "Choose an Encounter of Many Things Actor JSON file first."
      );
      return;
    }

    try {
      const actorData =
        JSON.parse(
          await file.text()
        );
      const actor =
        await importEncounterActor(
          actorData
        );

      ui.notifications.info(
        `Imported ${actor.name}.`
      );
      actor.sheet?.render(
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

  await fixSpellcastingActivityUuids(
    actor
  );

  return actor;
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

async function fixSpellcastingActivityUuids(
  actor
) {
  const updates =
    actor.items.flatMap(
      (item) => {
        const activities =
          foundry.utils.deepClone(
            item.system?.activities ?? {}
          );
        let changed =
          false;

        for (const activity of Object.values(
          activities
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

          activity.spell ??=
            {};
          activity.spell.uuid =
            spell.uuid;
          changed =
            true;
        }

        return changed
          ? [
              {
                _id:
                  item.id,
                "system.activities":
                  activities,
              },
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
