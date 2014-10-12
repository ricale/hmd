// # hmd.ricaleinline (hmd add-on)
//  - written by ricale
//  - ricale@ricalest.net

hmd.addInlineRules([
    [/--([^-\s]{1,2}|-[^-\s]|[^-\s]-|(?:[^\s].+?[^\s]))--/g,          '<del>$1</del>'],
    [/,,([^,\s]{1,2}|,[^,\s]|[^,\s],|(?:[^\s].+?[^\s])),,/g,          '<sub>$1</sub>'],
    [/\^\^([^\^\s]{1,2}|\^[^\^\s]|[^\^\s]\^|(?:[^\s].+?[^\s]))\^\^/g, '<sup>$1</sup>']
]);
