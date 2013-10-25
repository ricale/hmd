// # hmd.ricaleinline (hmd add-on)
//  - written by ricale
//  - ricale@hanmail.net or kim.kangseong@gmail.com

RICALE.hmd.setAdditionalDecodeInlineFunction(function(string) {
	string = string.replace(/--([^-\s]{1,2}|-[^-\s]|[^-\s]-|(?:[^\s].+?[^\s]))--/, '<del>$1</del>');
	string = string.replace(/,,([^,\s]{1,2}|,[^,\s]|[^,\s],|(?:[^\s].+?[^\s])),,/, '<sub>$1</sub>');
	string = string.replace(/\^\^([^\^\s]{1,2}|\^[^\^\s]|[^\^\s]\^|(?:[^\s].+?[^\s]))\^\^/, '<sup>$1</sup>');

    console.log(string)

	return string;
});