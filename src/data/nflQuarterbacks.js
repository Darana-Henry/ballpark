// Starting quarterbacks by team and season.
//
// Past seasons are static. ESPN's API exposes `gamesPlayed` but has no
// `gamesStarted` anywhere in its athlete statistics, so the starts shown here
// cannot come from it. They're scraped from Wikipedia's per-team
// "List of <team> starting quarterbacks" articles, which do publish starts.
//
// The CURRENT season is deliberately absent: it's read live from each team's
// depth chart by `fetchCurrentStartingQBs()`, so a mid-season change appears on
// the next load without this file being touched.
//
// Shape — team abbreviation → season → quarterbacks, most starts first:
//
//   export const QB_HISTORY = {
//     BUF: {
//       2020: [{ name: 'Josh Allen', starts: 16 }],
//       2018: [{ name: 'Josh Allen', starts: 11 }, { name: 'Nathan Peterman', starts: 2 }],
//     },
//   }
//
// Wikipedia is not consistent about the parenthesised number: most teams' pages
// give games started, but some give a win-loss record instead. Those arrive as
// `record: '3-5'` rather than `starts` and render as-is, because a record is
// not a start count.
//
// Green Bay and the LA Rams have no season-by-season table on Wikipedia at all
// — their articles list quarterbacks by tenure range — so they carry no history
// and their cells render empty.
//
// Regenerate:
//   npm run qb:fetch                              (Wikipedia, all teams)
//   node scripts/import-qb-history.mjs <csv>      (override from a spreadsheet)
// Everything between the generated markers below is rewritten by those scripts;
// re-run them rather than editing the data by hand.

export const QB_HISTORY_START_YEAR = 2016

// --- generated:start ---
export const QB_HISTORY = {
  "BUF": {
    "2016": [
      {
        "name": "Tyrod Taylor",
        "starts": 15
      },
      {
        "name": "EJ Manuel",
        "starts": 1
      }
    ],
    "2017": [
      {
        "name": "Tyrod Taylor",
        "starts": 14
      },
      {
        "name": "Nathan Peterman",
        "starts": 2
      }
    ],
    "2018": [
      {
        "name": "Josh Allen",
        "starts": 11
      },
      {
        "name": "Nathan Peterman",
        "starts": 2
      },
      {
        "name": "Derek Anderson",
        "starts": 2
      },
      {
        "name": "Matt Barkley",
        "starts": 1
      }
    ],
    "2019": [
      {
        "name": "Josh Allen",
        "starts": 16
      }
    ],
    "2020": [
      {
        "name": "Josh Allen",
        "starts": 16
      }
    ],
    "2021": [
      {
        "name": "Josh Allen",
        "starts": 17
      }
    ],
    "2022": [
      {
        "name": "Josh Allen",
        "starts": 16
      }
    ],
    "2023": [
      {
        "name": "Josh Allen",
        "starts": 17
      }
    ],
    "2024": [
      {
        "name": "Josh Allen",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "Josh Allen",
        "starts": 17
      }
    ],
    "2026": [
      {
        "name": "Josh Allen",
        "starts": 1
      }
    ]
  },
  "MIA": {
    "2016": [
      {
        "name": "Ryan Tannehill",
        "starts": 13
      }
    ],
    "2017": [
      {
        "name": "Jay Cutler",
        "starts": 14
      }
    ],
    "2018": [
      {
        "name": "Ryan Tannehill",
        "starts": 11
      }
    ],
    "2019": [
      {
        "name": "Ryan Fitzpatrick",
        "starts": 13
      }
    ],
    "2020": [
      {
        "name": "Ryan Fitzpatrick",
        "starts": 7
      }
    ],
    "2021": [
      {
        "name": "Tua Tagovailoa",
        "starts": 12
      }
    ],
    "2022": [
      {
        "name": "Tua Tagovailoa",
        "starts": 13
      }
    ],
    "2023": [
      {
        "name": "Tua Tagovailoa",
        "starts": 17
      }
    ],
    "2024": [
      {
        "name": "Tua Tagovailoa",
        "starts": 11
      }
    ],
    "2025": [
      {
        "name": "Tua Tagovailoa",
        "starts": 14
      }
    ],
    "2026": [
      {
        "name": "Malik Willis",
        "starts": 1
      }
    ]
  },
  "NE": {
    "2016": [
      {
        "name": "Tom Brady",
        "starts": 12
      },
      {
        "name": "Jacoby Brissett",
        "starts": 2
      },
      {
        "name": "Jimmy Garoppolo",
        "starts": 2
      }
    ],
    "2017": [
      {
        "name": "Tom Brady",
        "starts": 16
      }
    ],
    "2018": [
      {
        "name": "Tom Brady",
        "starts": 16
      }
    ],
    "2019": [
      {
        "name": "Tom Brady",
        "starts": 16
      }
    ],
    "2020": [
      {
        "name": "Cam Newton",
        "starts": 15
      },
      {
        "name": "Brian Hoyer",
        "starts": 1
      }
    ],
    "2021": [
      {
        "name": "Mac Jones",
        "starts": 17
      }
    ],
    "2022": [
      {
        "name": "Mac Jones",
        "starts": 14
      },
      {
        "name": "Bailey Zappe",
        "starts": 2
      },
      {
        "name": "Brian Hoyer",
        "starts": 1
      }
    ],
    "2023": [
      {
        "name": "Mac Jones",
        "starts": 11
      },
      {
        "name": "Bailey Zappe",
        "starts": 6
      }
    ],
    "2024": [
      {
        "name": "Drake Maye",
        "starts": 12
      },
      {
        "name": "Jacoby Brissett",
        "starts": 5
      }
    ],
    "2025": [
      {
        "name": "Drake Maye",
        "starts": 17
      }
    ],
    "2026": [
      {
        "name": "Drake Maye",
        "starts": 1
      }
    ]
  },
  "NYJ": {
    "2016": [
      {
        "name": "Ryan Fitzpatrick",
        "starts": 11
      },
      {
        "name": "Bryce Petty",
        "starts": 4
      },
      {
        "name": "Geno Smith",
        "starts": 1
      }
    ],
    "2017": [
      {
        "name": "Josh McCown",
        "starts": 13
      },
      {
        "name": "Bryce Petty",
        "starts": 3
      }
    ],
    "2018": [
      {
        "name": "Sam Darnold",
        "starts": 13
      },
      {
        "name": "Josh McCown",
        "starts": 3
      }
    ],
    "2019": [
      {
        "name": "Sam Darnold",
        "starts": 13
      },
      {
        "name": "Luke Falk",
        "starts": 2
      },
      {
        "name": "Trevor Siemian",
        "starts": 1
      }
    ],
    "2020": [
      {
        "name": "Sam Darnold",
        "starts": 12
      },
      {
        "name": "Joe Flacco",
        "starts": 4
      }
    ],
    "2021": [
      {
        "name": "Zach Wilson",
        "starts": 13
      },
      {
        "name": "Mike White",
        "starts": 3
      },
      {
        "name": "Joe Flacco",
        "starts": 1
      }
    ],
    "2022": [
      {
        "name": "Zach Wilson",
        "starts": 9
      },
      {
        "name": "Mike White",
        "starts": 4
      },
      {
        "name": "Joe Flacco",
        "starts": 4
      }
    ],
    "2023": [
      {
        "name": "Zach Wilson",
        "starts": 11
      },
      {
        "name": "Trevor Siemian",
        "starts": 3
      },
      {
        "name": "Tim Boyle",
        "starts": 2
      },
      {
        "name": "Aaron Rodgers",
        "starts": 1
      }
    ],
    "2024": [
      {
        "name": "Aaron Rodgers",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "Justin Fields",
        "starts": 9
      },
      {
        "name": "Tyrod Taylor",
        "starts": 4
      },
      {
        "name": "Brady Cook",
        "starts": 4
      }
    ],
    "2026": [
      {
        "name": "Geno Smith",
        "starts": 1
      }
    ]
  },
  "BAL": {
    "2016": [
      {
        "name": "Joe Flacco",
        "starts": 16
      }
    ],
    "2017": [
      {
        "name": "Joe Flacco",
        "starts": 16
      }
    ],
    "2018": [
      {
        "name": "Joe Flacco",
        "starts": 9
      },
      {
        "name": "Lamar Jackson",
        "starts": 7
      }
    ],
    "2019": [
      {
        "name": "Lamar Jackson",
        "starts": 15
      },
      {
        "name": "Robert Griffin III",
        "starts": 1
      }
    ],
    "2020": [
      {
        "name": "Lamar Jackson",
        "starts": 15
      },
      {
        "name": "Robert Griffin III",
        "starts": 1
      }
    ],
    "2021": [
      {
        "name": "Lamar Jackson",
        "starts": 12
      },
      {
        "name": "Tyler Huntley",
        "starts": 4
      },
      {
        "name": "Josh Johnson",
        "starts": 1
      }
    ],
    "2022": [
      {
        "name": "Lamar Jackson",
        "starts": 12
      },
      {
        "name": "Tyler Huntley",
        "starts": 4
      },
      {
        "name": "Anthony Brown",
        "starts": 1
      }
    ],
    "2023": [
      {
        "name": "Lamar Jackson",
        "starts": 16
      },
      {
        "name": "Tyler Huntley",
        "starts": 1
      }
    ],
    "2024": [
      {
        "name": "Lamar Jackson",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "Lamar Jackson",
        "starts": 13
      },
      {
        "name": "Tyler Huntley",
        "starts": 2
      },
      {
        "name": "Cooper Rush",
        "starts": 2
      }
    ],
    "2026": [
      {
        "name": "Lamar Jackson",
        "starts": 1
      }
    ]
  },
  "CIN": {
    "2016": [
      {
        "name": "Andy Dalton",
        "starts": 16
      }
    ],
    "2017": [
      {
        "name": "Andy Dalton",
        "starts": 16
      }
    ],
    "2018": [
      {
        "name": "Andy Dalton",
        "starts": 11
      },
      {
        "name": "Jeff Driskel",
        "starts": 5
      }
    ],
    "2019": [
      {
        "name": "Andy Dalton",
        "starts": 13
      },
      {
        "name": "Ryan Finley",
        "starts": 3
      }
    ],
    "2020": [
      {
        "name": "Joe Burrow",
        "starts": 10
      },
      {
        "name": "Brandon Allen",
        "starts": 5
      },
      {
        "name": "Ryan Finley",
        "starts": 1
      }
    ],
    "2021": [
      {
        "name": "Joe Burrow",
        "starts": 16
      },
      {
        "name": "Brandon Allen",
        "starts": 1
      }
    ],
    "2022": [
      {
        "name": "Joe Burrow",
        "starts": 16
      }
    ],
    "2023": [
      {
        "name": "Joe Burrow",
        "starts": 10
      },
      {
        "name": "Jake Browning",
        "starts": 7
      }
    ],
    "2024": [
      {
        "name": "Joe Burrow",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "Joe Burrow",
        "starts": 8
      },
      {
        "name": "Joe Flacco",
        "starts": 6
      },
      {
        "name": "Jake Browning",
        "starts": 3
      }
    ],
    "2026": [
      {
        "name": "Joe Burrow",
        "starts": 1
      }
    ]
  },
  "CLE": {
    "2016": [
      {
        "name": "Cody Kessler",
        "starts": 8
      },
      {
        "name": "Robert Griffin III",
        "starts": 5
      },
      {
        "name": "Josh McCown",
        "starts": 3
      }
    ],
    "2017": [
      {
        "name": "DeShone Kizer",
        "starts": 15
      },
      {
        "name": "Kevin Hogan",
        "starts": 1
      }
    ],
    "2018": [
      {
        "name": "Baker Mayfield",
        "starts": 13
      },
      {
        "name": "Tyrod Taylor",
        "starts": 3
      }
    ],
    "2019": [
      {
        "name": "Baker Mayfield",
        "starts": 16
      }
    ],
    "2020": [
      {
        "name": "Baker Mayfield",
        "starts": 16
      }
    ],
    "2021": [
      {
        "name": "Baker Mayfield",
        "starts": 14
      },
      {
        "name": "Case Keenum",
        "starts": 2
      },
      {
        "name": "Nick Mullens",
        "starts": 1
      }
    ],
    "2022": [
      {
        "name": "Jacoby Brissett",
        "starts": 11
      },
      {
        "name": "Deshaun Watson",
        "starts": 6
      }
    ],
    "2023": [
      {
        "name": "Deshaun Watson",
        "starts": 6
      },
      {
        "name": "Joe Flacco",
        "starts": 5
      },
      {
        "name": "Dorian Thompson-Robinson",
        "starts": 3
      },
      {
        "name": "P. J. Walker",
        "starts": 2
      },
      {
        "name": "Jeff Driskel",
        "starts": 1
      }
    ],
    "2024": [
      {
        "name": "Jameis Winston",
        "starts": 7
      },
      {
        "name": "Deshaun Watson",
        "starts": 7
      },
      {
        "name": "Dorian Thompson-Robinson",
        "starts": 2
      },
      {
        "name": "Bailey Zappe",
        "starts": 1
      }
    ],
    "2025": [
      {
        "name": "Shedeur Sanders",
        "starts": 7
      },
      {
        "name": "Dillon Gabriel",
        "starts": 6
      },
      {
        "name": "Joe Flacco",
        "starts": 4
      }
    ],
    "2026": [
      {
        "name": "Deshaun Watson",
        "starts": 1
      }
    ]
  },
  "PIT": {
    "2016": [
      {
        "name": "Ben Roethlisberger",
        "starts": 14
      },
      {
        "name": "Landry Jones",
        "starts": 2
      }
    ],
    "2017": [
      {
        "name": "Ben Roethlisberger",
        "starts": 15
      },
      {
        "name": "Landry Jones",
        "starts": 1
      }
    ],
    "2018": [
      {
        "name": "Ben Roethlisberger",
        "starts": 16
      }
    ],
    "2019": [
      {
        "name": "Mason Rudolph",
        "starts": 8
      },
      {
        "name": "Devlin Hodges",
        "starts": 6
      },
      {
        "name": "Ben Roethlisberger",
        "starts": 2
      }
    ],
    "2020": [
      {
        "name": "Ben Roethlisberger",
        "starts": 15
      },
      {
        "name": "Mason Rudolph",
        "starts": 1
      }
    ],
    "2021": [
      {
        "name": "Ben Roethlisberger",
        "starts": 16
      },
      {
        "name": "Mason Rudolph",
        "starts": 1
      }
    ],
    "2022": [
      {
        "name": "Kenny Pickett",
        "starts": 12
      },
      {
        "name": "Mitchell Trubisky",
        "starts": 5
      }
    ],
    "2023": [
      {
        "name": "Kenny Pickett",
        "starts": 12
      },
      {
        "name": "Mason Rudolph",
        "starts": 3
      },
      {
        "name": "Mitchell Trubisky",
        "starts": 2
      }
    ],
    "2024": [
      {
        "name": "Russell Wilson",
        "starts": 11
      },
      {
        "name": "Justin Fields",
        "starts": 6
      }
    ],
    "2025": [
      {
        "name": "Aaron Rodgers",
        "starts": 16
      },
      {
        "name": "Mason Rudolph",
        "starts": 1
      }
    ],
    "2026": [
      {
        "name": "Aaron Rodgers",
        "starts": 1
      }
    ]
  },
  "HOU": {
    "2016": [
      {
        "name": "Brock Osweiler",
        "starts": 14
      },
      {
        "name": "Tom Savage",
        "starts": 2
      }
    ],
    "2017": [
      {
        "name": "Tom Savage",
        "starts": 7
      },
      {
        "name": "Deshaun Watson",
        "starts": 6
      },
      {
        "name": "T. J. Yates",
        "starts": 3
      }
    ],
    "2018": [
      {
        "name": "Deshaun Watson",
        "starts": 16
      }
    ],
    "2019": [
      {
        "name": "Deshaun Watson",
        "starts": 15
      },
      {
        "name": "A. J. McCarron",
        "starts": 1
      }
    ],
    "2020": [
      {
        "name": "Deshaun Watson",
        "starts": 16
      }
    ],
    "2021": [
      {
        "name": "Davis Mills",
        "starts": 11
      },
      {
        "name": "Tyrod Taylor",
        "starts": 6
      }
    ],
    "2022": [
      {
        "name": "Davis Mills",
        "starts": 14
      },
      {
        "name": "Kyle Allen",
        "starts": 2
      },
      {
        "name": "Jeff Driskel",
        "starts": 1
      }
    ],
    "2023": [
      {
        "name": "C. J. Stroud",
        "starts": 15
      },
      {
        "name": "Case Keenum",
        "starts": 2
      }
    ],
    "2024": [
      {
        "name": "C. J. Stroud",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "C. J. Stroud",
        "starts": 14
      },
      {
        "name": "Davis Mills",
        "starts": 3
      }
    ],
    "2026": [
      {
        "name": "C. J. Stroud",
        "starts": 1
      }
    ]
  },
  "IND": {
    "2016": [
      {
        "name": "Andrew Luck",
        "starts": 15
      },
      {
        "name": "Scott Tolzien",
        "starts": 1
      }
    ],
    "2017": [
      {
        "name": "Jacoby Brissett",
        "starts": 15
      },
      {
        "name": "Scott Tolzien",
        "starts": 1
      }
    ],
    "2018": [
      {
        "name": "Andrew Luck",
        "starts": 16
      }
    ],
    "2019": [
      {
        "name": "Jacoby Brissett",
        "starts": 15
      },
      {
        "name": "Brian Hoyer",
        "starts": 1
      }
    ],
    "2020": [
      {
        "name": "Philip Rivers",
        "starts": 16
      }
    ],
    "2021": [
      {
        "name": "Carson Wentz",
        "starts": 17
      }
    ],
    "2022": [
      {
        "name": "Matt Ryan",
        "starts": 12
      },
      {
        "name": "Sam Ehlinger",
        "starts": 3
      },
      {
        "name": "Nick Foles",
        "starts": 2
      }
    ],
    "2023": [
      {
        "name": "Gardner Minshew",
        "starts": 13
      },
      {
        "name": "Anthony Richardson",
        "starts": 4
      }
    ],
    "2024": [
      {
        "name": "Anthony Richardson",
        "starts": 11
      },
      {
        "name": "Joe Flacco",
        "starts": 6
      }
    ],
    "2025": [
      {
        "name": "Daniel Jones",
        "starts": 13
      },
      {
        "name": "Philip Rivers",
        "starts": 3
      },
      {
        "name": "Riley Leonard",
        "starts": 1
      }
    ],
    "2026": [
      {
        "name": "Daniel Jones",
        "starts": 1
      }
    ]
  },
  "JAX": {
    "2016": [
      {
        "name": "Blake Bortles",
        "record": "3-13"
      }
    ],
    "2017": [
      {
        "name": "Blake Bortles",
        "record": "10-6"
      }
    ],
    "2018": [
      {
        "name": "Blake Bortles",
        "record": "3-9"
      },
      {
        "name": "Cody Kessler",
        "record": "2-2"
      }
    ],
    "2019": [
      {
        "name": "Gardner Minshew",
        "record": "6-6"
      },
      {
        "name": "Nick Foles",
        "record": "0-4"
      }
    ],
    "2020": [
      {
        "name": "Gardner Minshew",
        "record": "1-7"
      },
      {
        "name": "Mike Glennon",
        "record": "0-5"
      },
      {
        "name": "Jake Luton",
        "record": "0-3"
      }
    ],
    "2021": [
      {
        "name": "Trevor Lawrence",
        "record": "3-14"
      }
    ],
    "2022": [
      {
        "name": "Trevor Lawrence",
        "record": "9-8"
      }
    ],
    "2023": [
      {
        "name": "Trevor Lawrence",
        "record": "8-8"
      },
      {
        "name": "C. J. Beathard",
        "record": "1-0"
      }
    ],
    "2024": [
      {
        "name": "Trevor Lawrence",
        "record": "2-8"
      },
      {
        "name": "Mac Jones",
        "record": "2-5"
      }
    ],
    "2025": [
      {
        "name": "Trevor Lawrence",
        "record": "13-4"
      }
    ],
    "2026": [
      {
        "name": "Trevor Lawrence",
        "record": "1-0"
      }
    ]
  },
  "TEN": {
    "2016": [
      {
        "name": "Marcus Mariota",
        "starts": 15
      },
      {
        "name": "Matt Cassel",
        "starts": 1
      }
    ],
    "2017": [
      {
        "name": "Marcus Mariota",
        "starts": 15
      },
      {
        "name": "Matt Cassel",
        "starts": 1
      }
    ],
    "2018": [
      {
        "name": "Marcus Mariota",
        "starts": 13
      },
      {
        "name": "Blaine Gabbert",
        "starts": 3
      }
    ],
    "2019": [
      {
        "name": "Ryan Tannehill",
        "starts": 10
      },
      {
        "name": "Marcus Mariota",
        "starts": 6
      }
    ],
    "2020": [
      {
        "name": "Ryan Tannehill",
        "starts": 16
      }
    ],
    "2021": [
      {
        "name": "Ryan Tannehill",
        "starts": 17
      }
    ],
    "2022": [
      {
        "name": "Ryan Tannehill",
        "starts": 12
      },
      {
        "name": "Malik Willis",
        "starts": 3
      },
      {
        "name": "Joshua Dobbs",
        "starts": 2
      }
    ],
    "2023": [
      {
        "name": "Will Levis",
        "starts": 9
      },
      {
        "name": "Ryan Tannehill",
        "starts": 8
      }
    ],
    "2024": [
      {
        "name": "Will Levis",
        "starts": 12
      },
      {
        "name": "Mason Rudolph",
        "starts": 5
      }
    ],
    "2025": [
      {
        "name": "Cam Ward",
        "starts": 17
      }
    ],
    "2026": [
      {
        "name": "Cam Ward",
        "starts": 1
      }
    ]
  },
  "DEN": {
    "2016": [
      {
        "name": "Trevor Siemian",
        "starts": 14
      },
      {
        "name": "Paxton Lynch",
        "starts": 2
      }
    ],
    "2017": [
      {
        "name": "Trevor Siemian",
        "starts": 10
      },
      {
        "name": "Brock Osweiler",
        "starts": 4
      },
      {
        "name": "Paxton Lynch",
        "starts": 2
      }
    ],
    "2018": [
      {
        "name": "Case Keenum",
        "starts": 16
      }
    ],
    "2019": [
      {
        "name": "Joe Flacco",
        "starts": 8
      },
      {
        "name": "Drew Lock",
        "starts": 5
      },
      {
        "name": "Brandon Allen",
        "starts": 3
      }
    ],
    "2020": [
      {
        "name": "Drew Lock",
        "starts": 13
      },
      {
        "name": "Jeff Driskel",
        "starts": 1
      },
      {
        "name": "Brett Rypien",
        "starts": 1
      },
      {
        "name": "Kendall Hinton",
        "starts": 1
      }
    ],
    "2021": [
      {
        "name": "Teddy Bridgewater",
        "starts": 14
      },
      {
        "name": "Drew Lock",
        "starts": 3
      }
    ],
    "2022": [
      {
        "name": "Russell Wilson",
        "starts": 15
      },
      {
        "name": "Brett Rypien",
        "starts": 2
      }
    ],
    "2023": [
      {
        "name": "Russell Wilson",
        "starts": 15
      },
      {
        "name": "Jarrett Stidham",
        "starts": 2
      }
    ],
    "2024": [
      {
        "name": "Bo Nix",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "Bo Nix",
        "starts": 17
      }
    ],
    "2026": [
      {
        "name": "Bo Nix",
        "starts": 1
      }
    ]
  },
  "KC": {
    "2016": [
      {
        "name": "Alex Smith",
        "starts": 15
      },
      {
        "name": "Nick Foles",
        "starts": 1
      }
    ],
    "2017": [
      {
        "name": "Alex Smith",
        "starts": 15
      },
      {
        "name": "Patrick Mahomes",
        "starts": 1
      }
    ],
    "2018": [
      {
        "name": "Patrick Mahomes",
        "starts": 16
      }
    ],
    "2019": [
      {
        "name": "Patrick Mahomes",
        "starts": 14
      },
      {
        "name": "Matt Moore",
        "starts": 2
      }
    ],
    "2020": [
      {
        "name": "Patrick Mahomes",
        "starts": 15
      },
      {
        "name": "Chad Henne",
        "starts": 1
      }
    ],
    "2021": [
      {
        "name": "Patrick Mahomes",
        "starts": 17
      }
    ],
    "2022": [
      {
        "name": "Patrick Mahomes",
        "starts": 17
      }
    ],
    "2023": [
      {
        "name": "Patrick Mahomes",
        "starts": 16
      },
      {
        "name": "Blaine Gabbert",
        "starts": 1
      }
    ],
    "2024": [
      {
        "name": "Patrick Mahomes",
        "starts": 16
      },
      {
        "name": "Carson Wentz",
        "starts": 1
      }
    ],
    "2025": [
      {
        "name": "Patrick Mahomes",
        "starts": 14
      },
      {
        "name": "Chris Oladokun",
        "starts": 2
      },
      {
        "name": "Gardner Minshew",
        "starts": 1
      }
    ],
    "2026": [
      {
        "name": "Patrick Mahomes",
        "starts": 1
      }
    ]
  },
  "LV": {
    "2016": [
      {
        "name": "Derek Carr",
        "starts": 15
      },
      {
        "name": "Matt McGloin",
        "starts": 1
      }
    ],
    "2017": [
      {
        "name": "Derek Carr",
        "starts": 15
      },
      {
        "name": "EJ Manuel",
        "starts": 1
      }
    ],
    "2018": [
      {
        "name": "Derek Carr",
        "starts": 16
      }
    ],
    "2019": [
      {
        "name": "Derek Carr",
        "starts": 16
      }
    ],
    "2020": [
      {
        "name": "Derek Carr",
        "starts": 16
      }
    ],
    "2021": [
      {
        "name": "Derek Carr",
        "starts": 17
      }
    ],
    "2022": [
      {
        "name": "Derek Carr",
        "starts": 15
      },
      {
        "name": "Jarrett Stidham",
        "starts": 2
      }
    ],
    "2023": [
      {
        "name": "Aidan OConnell",
        "starts": 10
      },
      {
        "name": "Jimmy Garoppolo",
        "starts": 6
      },
      {
        "name": "Brian Hoyer",
        "starts": 1
      }
    ],
    "2024": [
      {
        "name": "Gardner Minshew",
        "starts": 9
      },
      {
        "name": "Aidan OConnell",
        "starts": 7
      },
      {
        "name": "Desmond Ridder",
        "starts": 1
      }
    ],
    "2025": [
      {
        "name": "Geno Smith",
        "starts": 15
      },
      {
        "name": "Kenny Pickett",
        "starts": 2
      }
    ],
    "2026": [
      {
        "name": "Kirk Cousins",
        "starts": 1
      }
    ]
  },
  "LAC": {
    "2016": [
      {
        "name": "Philip Rivers",
        "record": "5-11"
      }
    ],
    "2017": [
      {
        "name": "Philip Rivers",
        "record": "9-7"
      }
    ],
    "2018": [
      {
        "name": "Philip Rivers",
        "record": "12-4"
      }
    ],
    "2019": [
      {
        "name": "Philip Rivers",
        "record": "5-11"
      }
    ],
    "2020": [
      {
        "name": "Tyrod Taylor",
        "record": "1-0"
      },
      {
        "name": "Justin Herbert",
        "record": "6-9"
      }
    ],
    "2021": [
      {
        "name": "Justin Herbert",
        "record": "9-8"
      }
    ],
    "2022": [
      {
        "name": "Justin Herbert",
        "record": "10-7"
      }
    ],
    "2023": [
      {
        "name": "Justin Herbert",
        "record": "5-8"
      },
      {
        "name": "Easton Stick",
        "record": "0-4"
      }
    ],
    "2024": [
      {
        "name": "Justin Herbert",
        "record": "11-6"
      }
    ],
    "2025": [
      {
        "name": "Justin Herbert",
        "record": "11-5"
      },
      {
        "name": "Trey Lance",
        "record": "0-1"
      }
    ],
    "2026": [
      {
        "name": "Justin Herbert",
        "record": "0-1"
      }
    ]
  },
  "DAL": {
    "2016": [
      {
        "name": "Dak Prescott",
        "record": "13-3"
      }
    ],
    "2017": [
      {
        "name": "Dak Prescott",
        "record": "9-7"
      }
    ],
    "2018": [
      {
        "name": "Dak Prescott",
        "record": "10-6"
      }
    ],
    "2019": [
      {
        "name": "Dak Prescott",
        "record": "8-8"
      }
    ],
    "2020": [
      {
        "name": "Andy Dalton",
        "record": "4-5"
      },
      {
        "name": "Dak Prescott",
        "record": "2-3"
      },
      {
        "name": "Garrett Gilbert",
        "record": "0-1"
      },
      {
        "name": "Ben DiNucci",
        "record": "0-1"
      }
    ],
    "2021": [
      {
        "name": "Dak Prescott",
        "record": "11-5"
      },
      {
        "name": "Cooper Rush",
        "record": "1-0"
      }
    ],
    "2022": [
      {
        "name": "Dak Prescott",
        "record": "8-4"
      },
      {
        "name": "Cooper Rush",
        "record": "4-1"
      }
    ],
    "2023": [
      {
        "name": "Dak Prescott",
        "record": "12-5"
      }
    ],
    "2024": [
      {
        "name": "Dak Prescott",
        "record": "3-5"
      },
      {
        "name": "Cooper Rush",
        "record": "4-4"
      },
      {
        "name": "Trey Lance",
        "record": "0-1"
      }
    ],
    "2025": [
      {
        "name": "Dak Prescott",
        "record": "7-9-1"
      }
    ]
  },
  "NYG": {
    "2016": [
      {
        "name": "Eli Manning",
        "starts": 16
      }
    ],
    "2017": [
      {
        "name": "Eli Manning",
        "starts": 15
      },
      {
        "name": "Geno Smith",
        "starts": 1
      }
    ],
    "2018": [
      {
        "name": "Eli Manning",
        "starts": 16
      }
    ],
    "2019": [
      {
        "name": "Daniel Jones",
        "starts": 12
      },
      {
        "name": "Eli Manning",
        "starts": 4
      }
    ],
    "2020": [
      {
        "name": "Daniel Jones",
        "starts": 14
      },
      {
        "name": "Colt McCoy",
        "starts": 2
      }
    ],
    "2021": [
      {
        "name": "Daniel Jones",
        "starts": 11
      },
      {
        "name": "Mike Glennon",
        "starts": 4
      },
      {
        "name": "Jake Fromm",
        "starts": 2
      }
    ],
    "2022": [
      {
        "name": "Daniel Jones",
        "starts": 16
      },
      {
        "name": "Davis Webb",
        "starts": 1
      }
    ],
    "2023": [
      {
        "name": "Daniel Jones",
        "starts": 6
      },
      {
        "name": "Tommy DeVito",
        "starts": 6
      },
      {
        "name": "Tyrod Taylor",
        "starts": 5
      }
    ],
    "2024": [
      {
        "name": "Daniel Jones",
        "starts": 10
      },
      {
        "name": "Drew Lock",
        "starts": 5
      },
      {
        "name": "Tommy DeVito",
        "starts": 2
      }
    ],
    "2025": [
      {
        "name": "Jaxson Dart",
        "starts": 12
      },
      {
        "name": "Russell Wilson",
        "starts": 3
      },
      {
        "name": "Jameis Winston",
        "starts": 2
      }
    ],
    "2026": [
      {
        "name": "Jaxson Dart",
        "starts": 1
      }
    ]
  },
  "PHI": {
    "2016": [
      {
        "name": "Carson Wentz",
        "starts": 16
      }
    ],
    "2017": [
      {
        "name": "Carson Wentz",
        "starts": 13
      },
      {
        "name": "Nick Foles",
        "starts": 3
      }
    ],
    "2018": [
      {
        "name": "Carson Wentz",
        "starts": 11
      },
      {
        "name": "Nick Foles",
        "starts": 5
      }
    ],
    "2019": [
      {
        "name": "Carson Wentz",
        "starts": 16
      }
    ],
    "2020": [
      {
        "name": "Carson Wentz",
        "starts": 12
      },
      {
        "name": "Jalen Hurts",
        "starts": 4
      }
    ],
    "2021": [
      {
        "name": "Jalen Hurts",
        "starts": 15
      },
      {
        "name": "Gardner Minshew",
        "starts": 2
      }
    ],
    "2022": [
      {
        "name": "Jalen Hurts",
        "starts": 15
      },
      {
        "name": "Gardner Minshew",
        "starts": 2
      }
    ],
    "2023": [
      {
        "name": "Jalen Hurts",
        "starts": 17
      }
    ],
    "2024": [
      {
        "name": "Jalen Hurts",
        "starts": 15
      },
      {
        "name": "Kenny Pickett",
        "starts": 1
      },
      {
        "name": "Tanner McKee",
        "starts": 1
      }
    ],
    "2025": [
      {
        "name": "Jalen Hurts",
        "starts": 16
      },
      {
        "name": "Tanner McKee",
        "starts": 1
      }
    ]
  },
  "WAS": {
    "2016": [
      {
        "name": "Kirk Cousins",
        "starts": 16
      }
    ],
    "2017": [
      {
        "name": "Kirk Cousins",
        "starts": 16
      }
    ],
    "2018": [
      {
        "name": "Alex Smith",
        "starts": 10
      },
      {
        "name": "Josh Johnson",
        "starts": 3
      },
      {
        "name": "Colt McCoy",
        "starts": 2
      },
      {
        "name": "Mark Sanchez",
        "starts": 1
      }
    ],
    "2019": [
      {
        "name": "Case Keenum",
        "starts": 8
      },
      {
        "name": "Dwayne Haskins",
        "starts": 7
      },
      {
        "name": "Colt McCoy",
        "starts": 1
      }
    ],
    "2020": [
      {
        "name": "Alex Smith",
        "starts": 6
      },
      {
        "name": "Dwayne Haskins",
        "starts": 6
      },
      {
        "name": "Kyle Allen",
        "starts": 4
      }
    ],
    "2021": [
      {
        "name": "Taylor Heinicke",
        "starts": 15
      },
      {
        "name": "Ryan Fitzpatrick",
        "starts": 1
      },
      {
        "name": "Garrett Gilbert",
        "starts": 1
      }
    ],
    "2022": [
      {
        "name": "Taylor Heinicke",
        "starts": 9
      },
      {
        "name": "Carson Wentz",
        "starts": 7
      },
      {
        "name": "Sam Howell",
        "starts": 1
      }
    ],
    "2023": [
      {
        "name": "Sam Howell",
        "starts": 17
      }
    ],
    "2024": [
      {
        "name": "Jayden Daniels",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "Marcus Mariota",
        "starts": 8
      },
      {
        "name": "Jayden Daniels",
        "starts": 7
      },
      {
        "name": "Josh Johnson",
        "starts": 2
      }
    ]
  },
  "CHI": {
    "2016": [
      {
        "name": "Matt Barkley",
        "starts": 6
      },
      {
        "name": "Jay Cutler",
        "starts": 5
      },
      {
        "name": "Brian Hoyer",
        "starts": 5
      }
    ],
    "2017": [
      {
        "name": "Mitchell Trubisky",
        "starts": 12
      },
      {
        "name": "Mike Glennon",
        "starts": 4
      }
    ],
    "2018": [
      {
        "name": "Mitchell Trubisky",
        "starts": 14
      },
      {
        "name": "Chase Daniel",
        "starts": 2
      }
    ],
    "2019": [
      {
        "name": "Mitchell Trubisky",
        "starts": 15
      },
      {
        "name": "Chase Daniel",
        "starts": 1
      }
    ],
    "2020": [
      {
        "name": "Mitchell Trubisky",
        "starts": 9
      },
      {
        "name": "Nick Foles",
        "starts": 7
      }
    ],
    "2021": [
      {
        "name": "Justin Fields",
        "starts": 10
      },
      {
        "name": "Andy Dalton",
        "starts": 6
      },
      {
        "name": "Nick Foles",
        "starts": 1
      }
    ],
    "2022": [
      {
        "name": "Justin Fields",
        "starts": 15
      },
      {
        "name": "Trevor Siemian",
        "starts": 1
      },
      {
        "name": "Nathan Peterman",
        "starts": 1
      }
    ],
    "2023": [
      {
        "name": "Justin Fields",
        "starts": 13
      },
      {
        "name": "Tyson Bagent",
        "starts": 4
      }
    ],
    "2024": [
      {
        "name": "Caleb Williams",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "Caleb Williams",
        "starts": 17
      }
    ],
    "2026": [
      {
        "name": "Caleb Williams",
        "starts": 1
      }
    ]
  },
  "DET": {
    "2016": [
      {
        "name": "Matthew Stafford",
        "starts": 16
      }
    ],
    "2017": [
      {
        "name": "Matthew Stafford",
        "starts": 16
      }
    ],
    "2018": [
      {
        "name": "Matthew Stafford",
        "starts": 16
      }
    ],
    "2019": [
      {
        "name": "Matthew Stafford",
        "starts": 8
      },
      {
        "name": "David Blough",
        "starts": 5
      },
      {
        "name": "Jeff Driskel",
        "starts": 3
      }
    ],
    "2020": [
      {
        "name": "Matthew Stafford",
        "starts": 16
      }
    ],
    "2021": [
      {
        "name": "Jared Goff",
        "starts": 14
      },
      {
        "name": "Tim Boyle",
        "starts": 3
      }
    ],
    "2022": [
      {
        "name": "Jared Goff",
        "starts": 17
      }
    ],
    "2023": [
      {
        "name": "Jared Goff",
        "starts": 17
      }
    ],
    "2024": [
      {
        "name": "Jared Goff",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "Jared Goff",
        "starts": 17
      }
    ]
  },
  "MIN": {
    "2016": [
      {
        "name": "Sam Bradford",
        "starts": 15
      },
      {
        "name": "Shaun Hill",
        "starts": 1
      }
    ],
    "2017": [
      {
        "name": "Case Keenum",
        "starts": 14
      },
      {
        "name": "Sam Bradford",
        "starts": 2
      }
    ],
    "2018": [
      {
        "name": "Kirk Cousins",
        "starts": 16
      }
    ],
    "2019": [
      {
        "name": "Kirk Cousins",
        "starts": 15
      },
      {
        "name": "Sean Mannion",
        "starts": 1
      }
    ],
    "2020": [
      {
        "name": "Kirk Cousins",
        "starts": 16
      }
    ],
    "2021": [
      {
        "name": "Kirk Cousins",
        "starts": 16
      },
      {
        "name": "Sean Mannion",
        "starts": 1
      }
    ],
    "2022": [
      {
        "name": "Kirk Cousins",
        "starts": 17
      }
    ],
    "2023": [
      {
        "name": "Kirk Cousins",
        "starts": 8
      },
      {
        "name": "Joshua Dobbs",
        "starts": 4
      },
      {
        "name": "Nick Mullens",
        "starts": 3
      },
      {
        "name": "Jaren Hall",
        "starts": 2
      }
    ],
    "2024": [
      {
        "name": "Sam Darnold",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "J. J. McCarthy",
        "starts": 10
      },
      {
        "name": "Carson Wentz",
        "starts": 5
      },
      {
        "name": "Max Brosmer",
        "starts": 2
      }
    ]
  },
  "ATL": {
    "2016": [
      {
        "name": "Matt Ryan",
        "record": "11-5"
      }
    ],
    "2017": [
      {
        "name": "Matt Ryan",
        "record": "10-6"
      }
    ],
    "2018": [
      {
        "name": "Matt Ryan",
        "record": "7-9"
      }
    ],
    "2019": [
      {
        "name": "Matt Ryan",
        "record": "7-8"
      },
      {
        "name": "Matt Schaub",
        "record": "0-1"
      }
    ],
    "2020": [
      {
        "name": "Matt Ryan",
        "record": "4-12"
      }
    ],
    "2021": [
      {
        "name": "Matt Ryan",
        "record": "7-10"
      }
    ],
    "2022": [
      {
        "name": "Marcus Mariota",
        "record": "5-8"
      },
      {
        "name": "Desmond Ridder",
        "record": "2-2"
      }
    ],
    "2023": [
      {
        "name": "Desmond Ridder",
        "record": "6-7"
      },
      {
        "name": "Taylor Heinicke",
        "record": "1-3"
      }
    ],
    "2024": [
      {
        "name": "Kirk Cousins",
        "record": "7-7"
      },
      {
        "name": "Michael Penix Jr.",
        "record": "1-2"
      }
    ],
    "2025": [
      {
        "name": "Michael Penix Jr.",
        "record": "3-6"
      },
      {
        "name": "Kirk Cousins",
        "record": "5-3"
      }
    ],
    "2026": [
      {
        "name": "Cooper Rush",
        "record": "0-1"
      }
    ]
  },
  "CAR": {
    "2016": [
      {
        "name": "Cam Newton",
        "record": "6-8"
      },
      {
        "name": "Derek Anderson",
        "record": "0-2"
      }
    ],
    "2017": [
      {
        "name": "Cam Newton",
        "record": "11-5"
      }
    ],
    "2018": [
      {
        "name": "Cam Newton",
        "record": "6-8"
      },
      {
        "name": "Kyle Allen",
        "record": "1-0"
      },
      {
        "name": "Taylor Heinicke",
        "record": "0-1"
      }
    ],
    "2019": [
      {
        "name": "Kyle Allen",
        "record": "5-7"
      },
      {
        "name": "Cam Newton",
        "record": "0-2"
      },
      {
        "name": "Will Grier",
        "record": "0-2"
      }
    ],
    "2020": [
      {
        "name": "Teddy Bridgewater",
        "record": "4-11"
      },
      {
        "name": "P. J. Walker",
        "record": "1-0"
      }
    ],
    "2021": [
      {
        "name": "Sam Darnold",
        "record": "4-7"
      },
      {
        "name": "Cam Newton",
        "record": "0-5"
      },
      {
        "name": "P. J. Walker",
        "record": "1-0"
      }
    ],
    "2022": [
      {
        "name": "Sam Darnold",
        "record": "4-2"
      },
      {
        "name": "Baker Mayfield",
        "record": "1-5"
      },
      {
        "name": "P. J. Walker",
        "record": "2-3"
      }
    ],
    "2023": [
      {
        "name": "Bryce Young",
        "record": "2-14"
      },
      {
        "name": "Andy Dalton",
        "record": "0-1"
      }
    ],
    "2024": [
      {
        "name": "Bryce Young",
        "record": "4-8"
      },
      {
        "name": "Andy Dalton",
        "record": "1-4"
      }
    ],
    "2025": [
      {
        "name": "Bryce Young",
        "record": "8-8"
      },
      {
        "name": "Andy Dalton",
        "record": "0-1"
      }
    ],
    "2026": [
      {
        "name": "Bryce Young",
        "record": "0-1"
      }
    ]
  },
  "NO": {
    "2016": [
      {
        "name": "Drew Brees",
        "record": "7-9"
      }
    ],
    "2017": [
      {
        "name": "Drew Brees",
        "record": "11-5"
      }
    ],
    "2018": [
      {
        "name": "Drew Brees",
        "record": "13-2"
      },
      {
        "name": "Teddy Bridgewater",
        "record": "0-1"
      }
    ],
    "2019": [
      {
        "name": "Drew Brees",
        "record": "8-3"
      },
      {
        "name": "Teddy Bridgewater",
        "record": "5-0"
      }
    ],
    "2020": [
      {
        "name": "Drew Brees",
        "record": "9-3"
      },
      {
        "name": "Taysom Hill",
        "record": "3-1"
      }
    ],
    "2021": [
      {
        "name": "Jameis Winston",
        "record": "5-2"
      },
      {
        "name": "Taysom Hill",
        "record": "4-1"
      },
      {
        "name": "Trevor Siemian",
        "record": "1-3"
      },
      {
        "name": "Ian Book",
        "record": "0-1"
      }
    ],
    "2022": [
      {
        "name": "Andy Dalton",
        "record": "6-8"
      },
      {
        "name": "Jameis Winston",
        "record": "1-2"
      }
    ],
    "2023": [
      {
        "name": "Derek Carr",
        "record": "9-8"
      }
    ],
    "2024": [
      {
        "name": "Derek Carr",
        "record": "5-5"
      },
      {
        "name": "Spencer Rattler",
        "record": "0-6"
      },
      {
        "name": "Jake Haener",
        "record": "0-1"
      }
    ],
    "2025": [
      {
        "name": "Tyler Shough",
        "record": "5-4"
      },
      {
        "name": "Spencer Rattler",
        "record": "1-7"
      }
    ]
  },
  "TB": {
    "2016": [
      {
        "name": "Jameis Winston",
        "starts": 16
      }
    ],
    "2017": [
      {
        "name": "Jameis Winston",
        "starts": 13
      },
      {
        "name": "Ryan Fitzpatrick",
        "starts": 3
      }
    ],
    "2018": [
      {
        "name": "Jameis Winston",
        "starts": 9
      },
      {
        "name": "Ryan Fitzpatrick",
        "starts": 7
      }
    ],
    "2019": [
      {
        "name": "Jameis Winston",
        "starts": 16
      }
    ],
    "2020": [
      {
        "name": "Tom Brady",
        "starts": 16
      }
    ],
    "2021": [
      {
        "name": "Tom Brady",
        "starts": 17
      }
    ],
    "2022": [
      {
        "name": "Tom Brady",
        "starts": 17
      }
    ],
    "2023": [
      {
        "name": "Baker Mayfield",
        "starts": 17
      }
    ],
    "2024": [
      {
        "name": "Baker Mayfield",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "Baker Mayfield",
        "starts": 17
      }
    ]
  },
  "ARI": {
    "2016": [
      {
        "name": "Carson Palmer",
        "starts": 15
      },
      {
        "name": "Drew Stanton",
        "starts": 1
      }
    ],
    "2017": [
      {
        "name": "Carson Palmer",
        "starts": 7
      },
      {
        "name": "Blaine Gabbert",
        "starts": 5
      },
      {
        "name": "Drew Stanton",
        "starts": 4
      }
    ],
    "2018": [
      {
        "name": "Josh Rosen",
        "starts": 13
      },
      {
        "name": "Sam Bradford",
        "starts": 3
      }
    ],
    "2019": [
      {
        "name": "Kyler Murray",
        "starts": 16
      }
    ],
    "2020": [
      {
        "name": "Kyler Murray",
        "starts": 16
      }
    ],
    "2021": [
      {
        "name": "Kyler Murray",
        "starts": 14
      },
      {
        "name": "Colt McCoy",
        "starts": 3
      }
    ],
    "2022": [
      {
        "name": "Kyler Murray",
        "starts": 11
      },
      {
        "name": "Colt McCoy",
        "starts": 3
      },
      {
        "name": "David Blough",
        "starts": 2
      },
      {
        "name": "Trace McSorley",
        "starts": 1
      }
    ],
    "2023": [
      {
        "name": "Kyler Murray",
        "starts": 8
      },
      {
        "name": "Joshua Dobbs",
        "starts": 8
      },
      {
        "name": "Clayton Tune",
        "starts": 1
      }
    ],
    "2024": [
      {
        "name": "Kyler Murray",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "Jacoby Brissett",
        "starts": 12
      },
      {
        "name": "Kyler Murray",
        "starts": 5
      }
    ],
    "2026": [
      {
        "name": "Jacoby Brissett",
        "starts": 1
      }
    ]
  },
  "SEA": {
    "2016": [
      {
        "name": "Russell Wilson",
        "starts": 16
      }
    ],
    "2017": [
      {
        "name": "Russell Wilson",
        "starts": 16
      }
    ],
    "2018": [
      {
        "name": "Russell Wilson",
        "starts": 16
      }
    ],
    "2019": [
      {
        "name": "Russell Wilson",
        "starts": 16
      }
    ],
    "2020": [
      {
        "name": "Russell Wilson",
        "starts": 16
      }
    ],
    "2021": [
      {
        "name": "Russell Wilson",
        "starts": 14
      },
      {
        "name": "Geno Smith",
        "starts": 3
      }
    ],
    "2022": [
      {
        "name": "Geno Smith",
        "starts": 17
      }
    ],
    "2023": [
      {
        "name": "Geno Smith",
        "starts": 15
      },
      {
        "name": "Drew Lock",
        "starts": 2
      }
    ],
    "2024": [
      {
        "name": "Geno Smith",
        "starts": 17
      }
    ],
    "2025": [
      {
        "name": "Sam Darnold",
        "starts": 17
      }
    ],
    "2026": [
      {
        "name": "Sam Darnold",
        "starts": 1
      }
    ]
  },
  "SF": {
    "2016": [
      {
        "name": "Colin Kaepernick",
        "starts": 11
      },
      {
        "name": "Blaine Gabbert",
        "starts": 5
      }
    ],
    "2017": [
      {
        "name": "Brian Hoyer",
        "starts": 6
      },
      {
        "name": "C. J. Beathard",
        "starts": 5
      },
      {
        "name": "Jimmy Garoppolo",
        "starts": 5
      }
    ],
    "2018": [
      {
        "name": "Nick Mullens",
        "starts": 8
      },
      {
        "name": "C. J. Beathard",
        "starts": 5
      },
      {
        "name": "Jimmy Garoppolo",
        "starts": 3
      }
    ],
    "2019": [
      {
        "name": "Jimmy Garoppolo",
        "starts": 16
      }
    ],
    "2020": [
      {
        "name": "Nick Mullens",
        "starts": 8
      },
      {
        "name": "Jimmy Garoppolo",
        "starts": 6
      },
      {
        "name": "C. J. Beathard",
        "starts": 2
      }
    ],
    "2021": [
      {
        "name": "Jimmy Garoppolo",
        "starts": 15
      },
      {
        "name": "Trey Lance",
        "starts": 2
      }
    ],
    "2022": [
      {
        "name": "Jimmy Garoppolo",
        "starts": 10
      },
      {
        "name": "Brock Purdy",
        "starts": 5
      },
      {
        "name": "Trey Lance",
        "starts": 2
      }
    ],
    "2023": [
      {
        "name": "Brock Purdy",
        "starts": 16
      },
      {
        "name": "Sam Darnold",
        "starts": 1
      }
    ],
    "2024": [
      {
        "name": "Brock Purdy",
        "starts": 15
      },
      {
        "name": "Brandon Allen",
        "starts": 1
      },
      {
        "name": "Joshua Dobbs",
        "starts": 1
      }
    ],
    "2025": [
      {
        "name": "Brock Purdy",
        "starts": 9
      },
      {
        "name": "Mac Jones",
        "starts": 8
      }
    ],
    "2026": [
      {
        "name": "Brock Purdy",
        "starts": 1
      }
    ]
  }
}
// --- generated:end ---

// Seasons the grid renders, newest first. Derived from whatever the history
// actually contains so the table never shows a column of empty cells for a
// season nobody has filled in yet.
export function historySeasons(currentSeason) {
  const years = new Set()
  Object.values(QB_HISTORY).forEach(byYear =>
    Object.keys(byYear).forEach(y => {
      const year = Number(y)
      if (year >= QB_HISTORY_START_YEAR && year !== currentSeason) years.add(year)
    })
  )
  return [...years].sort((a, b) => b - a)
}
