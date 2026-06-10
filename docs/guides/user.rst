User Guide
==========

This guide is for **players and educators** using *Tradeoff: Agriculture
Edition* (the **esgame** application). It explains, step by step, how to start
the game, pick a language, choose a game style, place and remove production
types on the map, read your score, advance through levels, and open the
in-game help. No coding is required to play.

The game is a land-use allocation exercise: you decide which **production
type** (a way of using land, such as a crop) goes on each part of a map, and
the game shows you the **consequences** of those choices through colored
result maps and a running score. The point is to experience the *tradeoffs* —
gaining in one outcome usually costs you in another.


What the game is
----------------

You are shown one or more **suitability maps** (how well-suited each field is
to a given use) and a set of **production type** buttons. Your task is to
assign production types to the fields of the central game board. As you place
them, the game updates a **score** and (after you advance) shows
**consequence maps** that visualize the impact of your allocation.

There is no single "right" answer. Because outcomes trade off against one
another, the score for one map may rise while another falls. The goal is to
explore those tradeoffs and find an allocation you are happy with.

The application ships with **two game styles**, and you choose which to play on
the start page:

.. list-table:: The two game styles
   :header-rows: 1
   :widths: 18 22 60

   * - Style
     - Also called
     - What it means for you
   * - **Grid** / Fields
     - "Static maps", *Configuration 2*
     - The map is a grid of square fields. Scoring happens **instantly in
       your browser** — there is no server, so it works offline and responds
       immediately as you click.
   * - **Map** / Zones
     - "Dynamic maps", *Configuration 1*
     - The map is drawn as shaped zones (SVG). When you advance a level, your
       allocation is sent to a **backend calculator** that computes the
       consequence maps and returns them. This needs a network connection to
       that backend.

Both styles share the same controls and the same score board; they differ
mainly in how the consequence maps are produced (in your browser versus by a
backend).


The start / configuration page
-------------------------------

The start page is where every session begins. (In the application it lives at
the ``/config`` address; the bare site root ``/`` usually drops you straight
into a game.)

On the start page you will see, from top to bottom:

#. A welcome heading, **Tradeoff: Agriculture Edition**.
#. A **Language** selector (see :ref:`user-language`).
#. The prompt *"Select a configuration or import a custom"*, followed by the
   configuration buttons.
#. A **Make own configuration** button (for educators building their own
   game; covered briefly in :ref:`user-configurator`).
#. Partner logos.

The two ready-made configurations are:

.. list-table:: Start-page configurations
   :header-rows: 1
   :widths: 38 62

   * - Button
     - What it starts
   * - **Configuration 1 (Dynamic maps)**
     - The **Map / Zones** game (SVG style, backend-computed consequences).
   * - **Configuration 2 (Static maps)**
     - The **Grid / Fields** game (instant, in-browser scoring).

To start playing:

#. Choose your language.
#. Click **Configuration 1 (Dynamic maps)** or
   **Configuration 2 (Static maps)**.

That is all you need for a normal session.

**Importing a custom configuration.** Below the two buttons there is a file
picker with a **Start** button. If your educator gave you a configuration
file (a ``.json`` file), choose it with the file picker and click **Start**.
The game launches in whichever style the file specifies — grid or map — so you
do not have to know which one it is.

.. note::

   Whenever you return to the start page, the game state is reset, so any
   in-progress allocation is cleared. Make sure you are finished before
   navigating away.


.. _user-language:

Choosing a language
-------------------

The game is translated into **four languages**:

.. list-table:: Supported languages
   :header-rows: 1
   :widths: 20 30 50

   * - Code
     - Language
     - Notes
   * - ``de``
     - German
     -
   * - ``en``
     - English
     - Default / fallback language.
   * - ``nl``
     - Dutch
     -
   * - ``pt``
     - Portuguese
     -

To change the language:

#. On the start page, open the **Language** drop-down.
#. Pick your preferred language from the list.

The interface updates immediately, and your choice carries through into the
game. English is the default and is also used as a fallback for any text that
has not been translated.


The game screen
---------------

Once a game starts, the screen is divided into three vertical panels plus the
production-type controls:

.. list-table:: Game screen layout
   :header-rows: 1
   :widths: 20 80

   * - Area
     - What it contains
   * - **Left panel**
     - The **suitability map(s)** — small reference maps showing how
       suitable each field is for a use. Click one to make it the active map
       in the center.
   * - **Center panel**
     - The game **title**, the current **level** indicator, the
       **production-type buttons**, the large editable **game board**, the
       **score board**, the **Previous Level** / **Next Level** buttons, and
       the **help** ("?") icon.
   * - **Right panel**
     - The **consequence map(s)** for the currently selected production type —
       shown once consequences are available (see
       :ref:`user-consequences`).

The small maps in the side panels are reference views; the big board in the
center is the one you actually edit.


The production-type buttons and the legend
------------------------------------------

Above the central board is a row of **production-type buttons**, one per
available land use. Each button shows the production type's color (or its icon,
if the configuration uses image mode) and its translated name.

- Click a production-type button to **select** it. The selected button is
  highlighted, and the board switches to show that type's suitability map.
- Only one production type is selected at a time. Selecting a different button
  changes which type you will place next.

.. _user-legend:

The legend and the limited number of pieces
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Each map has a **legend** (the legend board) showing the colors used and the
values they represent — for suitability and consequence maps the legend marks
the value scale, colored green for positive outcomes and red for negative
ones, and for gradient maps it shows the low-to-high color band with its end
values.

A production type can have a **limited number of pieces**. In the
configuration, each production type carries a ``maxElements`` value:

- If ``maxElements`` is **0**, that type is **unlimited** — place as many as
  you like.
- If ``maxElements`` is **greater than 0**, you may place **at most that many**
  fields of that type. Once you reach the limit, further placements of that
  type are simply ignored until you remove some.

So part of the challenge is deciding *where* to spend a scarce production type,
not just whether to use it.


.. _user-placing:

Placing and removing production types on fields
-----------------------------------------------

Editing the board means assigning the currently selected production type to
fields (placing), or clearing fields (removing). You can act on one field at a
time, or "paint" across many by dragging.

**Before you start:** click the production-type button for the use you want to
place. That type becomes active.

Controls
~~~~~~~~

.. list-table:: Board controls
   :header-rows: 1
   :widths: 34 66

   * - Action
     - What it does
   * - **Left-click** a field
     - Places the selected production type on that field (or removes it if it
       was already placed — clicking a placed field toggles it off).
   * - **Drag with the left button held**, or **hold Shift while moving** over
       fields
     - **Selects / places** across every field you pass — lets you paint a
       whole area at once.
   * - **Right-click**, or **hold Ctrl while moving** over fields
     - **Deselects / removes** the production type from the fields you pass.
   * - **Hover** a field (without selecting)
     - Highlights it so you can see exactly which field(s) a click would
       affect.

In short: **left-click / Shift to add, right-click / Ctrl to remove.** The
normal browser right-click menu is suppressed on the board so that right-click
can be used for removing.

.. note::

   Depending on the configuration, a single click may place a small **block**
   of fields rather than one (the "selection size" / element size). The hover
   highlight shows you the exact footprint before you click.

Things to know while placing
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- You can only place onto **editable** fields. Non-editable fields ignore your
  clicks.
- A field can hold only **one** production type. Placing on an occupied field
  replaces what was there (or, for the same type, toggles it off).
- If the selected type has reached its piece limit
  (see :ref:`user-legend`), new placements of that type are ignored until you
  remove some.
- To switch what you are placing, click a different production-type button —
  you do **not** need to clear the board first.


Reading the score board and consequence maps
---------------------------------------------

The **score board** in the center shows your current standing.

The score board
~~~~~~~~~~~~~~~~

The score board is a small table:

- The top row shows the word **Score** and your **total** (the sum of every
  map's score).
- Each following row is **one map**, with its name and that map's score.
- A map's number is colored **green when positive** and **red when negative**,
  so you can see at a glance which outcomes you are helping and which you are
  hurting.

In the **grid (static)** style the score updates **live in your browser** the
moment you place or remove a field, so you get instant feedback as you
experiment. In the **map (dynamic)** style the score for the previous round is
shown after the backend has finished computing it.

.. _user-consequences:

Consequence maps
~~~~~~~~~~~~~~~~~

A **consequence map** visualizes the impact of your allocation on one outcome
(for example, an environmental indicator). Consequence maps appear in the
**right panel** and are tied to the **currently selected production type** —
selecting a different type shows the consequence maps relevant to it.

Consequence maps become available **after you advance a level** (see
:ref:`user-levels`), once the consequences of your first allocation have been
worked out. Read them together with the score board: the maps show *where* the
effects fall, while the score board sums them into a number. In the dynamic
style, a backend-rendered **result image** may also be shown beneath the score,
with an expand button to view it larger.


.. _user-levels:

Advancing levels (Previous / Next)
----------------------------------

The game proceeds in **levels (rounds)**. You make an allocation, advance, and
then see its consequences while you refine your choices.

Two buttons under the score board control this:

.. list-table:: Level navigation
   :header-rows: 1
   :widths: 26 74

   * - Button
     - What it does
   * - **Next Level**
     - Locks in your current allocation and moves forward. The previous
       level's board becomes read-only, the consequence maps and score for
       that round are produced, and you continue from there.
   * - **Previous Level**
     - Goes back to the earlier level to review it. (It is disabled while you
       are on level 1, since there is nothing before it.)

How advancing works in each style:

- **Grid / static:** advancing computes the new consequence maps **in your
  browser**, instantly.
- **Map / dynamic:** advancing **sends your allocation to the backend
  calculator**, which returns the consequence maps and score. A loading
  indicator appears while it works. If the backend cannot be reached you will
  see a *"Something went wrong, please try again later"* message — try again.

.. note::

   In the dynamic style a configuration can require a **minimum share of the
   board to be filled** before you may advance. If you click **Next Level**
   without having placed enough, a dialog tells you the required percentage and
   how much you have currently selected; place more fields and try again.


The help window
---------------

Every game screen has a **help ("?") icon** in the center header. Click it to
open the **Instructions** window, which explains the current task. Close it
with the **X** in its corner.

- The instructions are **context-aware**: on the first level you see the
  **basic instructions**; on later levels you see the **advanced
  instructions**. A configuration may also include an explanatory image, shown
  below the text.
- In the dynamic style the help window opens **automatically** on the early
  levels so that first-time players see the instructions without having to look
  for them.

If you ever feel lost, open the help window first — it always describes what
the current level expects of you.


.. _user-configurator:

For educators: making your own configuration
--------------------------------------------

If you want to build a custom game (your own maps, production types, languages,
and rules), the start page's **Make own configuration** button opens the
**configurator**. It is a step-by-step form — *General*, *Gameboard*,
*Production types*, *Custom Colors*, *Maps*, and *Finish* — and at the end you
**Export** a ``configuration.json`` file. Players then load that file through
the start page's import picker (see :ref:`The start / configuration page
<user-configurator>` above and the import step there).

A few player-facing settings worth knowing as an educator:

.. list-table:: Selected configurable behaviors
   :header-rows: 1
   :widths: 30 70

   * - Setting
     - Effect on play
   * - **Map type** (*Zones* vs *Fields*)
     - Chooses the **map / dynamic** style versus the **grid / static** style.
   * - **maxElements** (per production type)
     - The **piece limit** for that type; ``0`` means unlimited
       (see :ref:`user-legend`).
   * - **min-selected** (dynamic only)
     - The minimum share of the board a player must fill before advancing
       (see :ref:`user-levels`).
   * - **Image Mode**
     - Shows production-type **icons** on placed fields instead of flat
       colors.
   * - **Game name** / **Instructions** (per language)
     - The title and the basic/advanced help text shown to players in each of
       the four languages.

The detailed field-by-field reference for the configurator is intended for
people setting up deployments; players do not need it.


Quick reference
---------------

.. list-table:: At a glance
   :header-rows: 1
   :widths: 40 60

   * - I want to...
     - Do this
   * - Start a game
     - Pick a language, then click **Configuration 1** (map) or
       **Configuration 2** (grid).
   * - Choose a production type
     - Click its button above the board.
   * - Place a type / paint an area
     - **Left-click** a field, or **drag** / hold **Shift** across fields.
   * - Remove a type
     - **Right-click** a field, or hold **Ctrl** across fields.
   * - See my score
     - Read the **score board** under the board (green = good, red = bad).
   * - See impacts
     - Advance a level, then read the **consequence maps** on the right.
   * - Move between rounds
     - Use **Next Level** / **Previous Level**.
   * - Get instructions
     - Click the **?** icon to open the help window.
