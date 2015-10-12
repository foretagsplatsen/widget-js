define(
	[
		'./events',
		'./htmlCanvas',
		'./addons/routed',
		'./addons/transactable',
		'jquery'
	],

	function (events, htmlCanvas, routed, transactable, jQuery) {

		/**
		 * Base for all widgets. A widget can keep state in variables, contain logic and
		 * render itself using `renderOn()`.
		 *
		 * @example
		 *
		 *		var titleWidget = function(spec) {
		 *			var that = widget(spec);
		 *
		 *			var title = spec.title || 'Hello World';
		 *
		 *			that.renderContentOn = function(html) {
		 *				html.h1(title)
		 *			}
		 *
		 *			return that;
		 *		};
		 *
		 *		var helloWorldWidget = titleWidget({title: 'Hello Widget!'});
		 *
		 *		$(document).ready(function() {
		 *			helloWorldWidget.appendTo('BODY');
		 *		});
		 *
		 * Widgets can also be rendered on a HTML canvas (since widget implements `appendToBrush()`). Eg.
		 *
		 *		html.div(helloWorldWidget)
		 *
		 * It is therefor easy to compose widgets from other widgets.
		 *
		 *
		 * @param {Object} spec
		 * @param {String} [spec.id] Unique id for widget. Also used for root element when attached/rendered to DOM.
		 *                           If not provided an ID will automatically be generated and assigned.
		 * @param {Object} [my]
		 *
		 * @returns {widget}
		 */
		var widget = function (spec, my) {
			my = my || {};
			spec = spec || {};

			/** @typedef {{}} widget */
			var that = {};

			var id = spec.id || idGenerator.newId();

			/** When within an update transaction, do not update the widget */
			my.inUpdateTransaction = false;

			/**
			 * Keep track of the rendered subwidgets
			 */
			var children = [];

			/** Events for widget */
			my.events = events.eventCategory();

			/**
			 * Event triggered each time the widget is attached (or
			 * reattached due to an update of rendering) to the DOM.
			 */
			that.didAttach = my.events.createEvent();

			//
			// Public
			//

			/**
			 * Returns a unique id for the widget
			 *
			 * @returns {String}
			 */
			that.getId = function () {
				return id;
			};

			that.id = that.getId; //TODO: deprecated

			/**
			 * Performance tasks need for freeing/releasing/cleaning-up resources used by widget.
			 *
			 * Should always be executed before a widget is disposed. Especially
			 * if the widget register events to avoid memory leaks.
			 *
			 * If overridden in a subclass, make sure to execute `my.disposeWidget()`.
			 *
			 */
			that.dispose = function() {
				my.disposeWidget();
			};

			/**
			 * Renders the widget on a JQuery / DOM
			 *
			 * @example
			 * widget.appendTo('BODY');
			 *
			 * @param aJQuery
			 */
			that.appendTo = function (aJQuery) {
				renderBasicOn(htmlCanvas(aJQuery));
				that.triggerDidAttach();
			};

			/**
			 * Does the same as appendTo except it first clear the
			 * elements matched by aJQuery
			 *
			 * @param aJQuery
			 */
			that.replace = function (aJQuery) {
				var canvas = htmlCanvas(aJQuery);
				canvas.root.asJQuery().empty();
				renderBasicOn(canvas);
				that.triggerDidAttach();
			};

			/**
			 * Answers a jQuery that match the root DOM element. By default
			 * by selecting an element that have the same ID as the widget.
			 *
			 * See 'renderOn'
			 *
			 * @returns {*}
			 */
			that.asJQuery = function () {
				return jQuery('#' + that.getId());
			};

			/**
			 * Answers true if if widget have rendered content in DOM
			 *
			 * @returns {boolean}
			 */
			that.isRendered = function () {
				return that.asJQuery().length > 0;
			};

			/**
			 * Implementation for `appendToBrush()` to allow a widget to be
			 * appended to a brush. See 'htmlCanvas'.
			 *
			 * Basically it allows us to do:
			 *		html.div(widget);
			 *
			 * @param aTagBrush
			 */
			that.appendToBrush = function (aTagBrush) {
				renderBasicOn(htmlCanvas(aTagBrush.asJQuery()));
			};

			/**
			 * Trigger the `didAttach` event on the receiver and all
			 * rendered subwidgets.
			 */
			that.triggerDidAttach = function() {
				that.didAttach.trigger();
				children.forEach(function (widget) {
					widget.triggerDidAttach();
				});
			};

			// Expose events
			that.on = my.events.on;
			that.onceOn = my.events.onceOn;
			that.off = my.events.off;
			that.trigger = my.events.trigger;

			//
			// Protected
			//

			/**
			 * Exposes the internal ID generator. Generates new unique IDs to be used
			 * for sub-widgets, etc.
			 *
			 * @returns {String}
			 */
			my.nextId = function () {
				return idGenerator.newId();
			};

			/**
			 * Widget specific dispose.
			 */
			my.disposeWidget = function() {
				my.events.dispose();
			};

			my.trigger = my.events.trigger;

			//
			// Render
			//

			/**
			 * Private rendering function.	This is the function
			 * internally called each time the widget is rendered, in
			 * `appendTo`, `replace` and `update`.
			 *
			 */
			function renderBasicOn(html) {
				my.withChildrenRegistration(function() {
					that.renderOn(html);
				});
			}

			/**
			 * Main entry point for rendering. For convenience 'renderOn' will	wrap the content
			 * rendered by 'renderContentOn' in a root element (renderRootOn) that will be matched
			 * by asJQuery.
			 *
			 * Usually concrete widgets override 'renderContentOn' to render it content. Widgets
			 * can override 'renderOn' but must then make sure that it can be matched by 'asJQuery'.
			 *
			 * One way to do that is to make sure to have only one root element and setting the ID of
			 * that element to the ID of the widget.
			 *
			 * @example
			 *
			 *		that.renderOn = function (html) {
			 *			html.ul({id: that.getId()}
			 *				html.li('BMW'),
			 *				html.li('Toyota')
			 *			);
			 *		};
			 *
			 *
			 * @param html
			 */
			that.renderOn = function (html) {
				// Renders widget by wrapping `renderContentOn()` in a root element.
				my.renderRootOn(html).render(that.renderContentOn);
			};

			my.withChildrenRegistration = function(fn) {
				var parent = currentWidget.get();
				if(parent) {
					parent.registerChild(that);
				}
				withCurrentWidget(function () {
					children = [];
					fn();
				}, that);
			};

			that.registerChild = function(widget) {
				children.push(widget);
			};

			/**
			 * Renders a wrapper element (by default a 'widgetjs-widget' tag) and
			 * set the element ID to the ID of the widget so that it can be found by
			 * 'asJQuery' eg. when we re-render using 'update'.
			 *
			 * @param html
			 * @returns {htmlBrush}
			 */
			my.renderRootOn = function (html) {
				return html.tag('widgetjs-widget').id(id);
			};

			/**
			 * Overridden in concrete widgets to render widget to canvas/DOM.
			 *
			 * @example
			 *
			 *		that.renderContentOn = function (html) {
			 *			html.ul(
			 *				html.li('BMW'),
			 *				html.li('Toyota')
			 *			);
			 *		};
			 *
			 * @param {htmlCanvas} html
			 */
			that.renderContentOn = function (html) {};

			/**
			 * Re-renders the widget and replace it in the DOM
			 *
			 * Content is first re-rendered on a document fragment. Update then replace the element matched
			 * by 'asJQuery' with the new content.
			 *
			 */
			that.update = function () {
				if (my.inUpdateTransaction || !that.isRendered()) {
					return;
				}

				// Re-render
				var html = htmlCanvas();
				renderBasicOn(html);

				// Replace our self
				that.asJQuery().replaceWith(html.root.element);
				that.triggerDidAttach();
			};

			that.withinTransaction = function(fn, onDone) {
				if(my.inUpdateTransaction) {
					fn();
				} else {
					try {
						my.inUpdateTransaction = true;
						fn();
					}
					finally {
						my.inUpdateTransaction = false;
						if(onDone) {
							onDone();
						}
					}
				}
			};


			/**
			 * Evaluate `fn`, ensuring that an update will be
			 * performed after evaluating the function. Nested calls
			 * to `withUpdate` or `update` will result in updating the
			 * widget only once.
			 */
			that.withUpdate = function(fn) {
				that.withinTransaction(fn, that.update);
			};

			that.withNoUpdate = function(fn) {
				that.withinTransaction(fn);
			};


			return that;
		};

		/**
		 * Creates unique ids used by widgets to identify their root div.
		 */
		var idGenerator = (function () {
			var that = {};
			var id = 0;

			that.newId = function () {
				id += 1;
				return id.toString();
			};

			return that;
		})();

		/**
		 * Helpers for keeping track of the currently rendered widget.
		 */
		var currentWidget = (function () {
			var current;
			return {
				get: function () {
					return current;
				},
				set: function (widget) {
					current = widget;
				}
			};
		})();

		/**
		 * Set `widget` as the current widget while evaluating `fn`.
		 */
		function withCurrentWidget(fn, widget) {
			var current = currentWidget.get();
			try {
				currentWidget.set(widget);
				fn();
			} finally {
				currentWidget.set(current);
			}
		}

		return routed(widget);
	}
);
