( function () {

	/**
 * NURBS curve object
 *
 * Derives from THREE.Curve, overriding getPoint and getTangent.
 *
 * Implementation is based on (x, y [, z=0 [, w=1]]) control points with w=weight.
 *
 **/

	var NURBSCurve = function ( degree, knots
		/* array of reals */
		, controlPoints
		/* array of Vector(2|3|4) */
		, startKnot
		/* index in knots */
		, endKnot
		/* index in knots */
	) {

		THREE.Curve.call( this );
		this.degree = degree;
		this.knots = knots;
		this.controlPoints = []; // Used by periodic NURBS to remove hidden spans

		this.startKnot = startKnot || 0;
		this.endKnot = endKnot || this.knots.length - 1;

		for ( var i = 0; i < controlPoints.length; ++ i ) {

			// ensure THREE.Vector4 for control points
			var point = controlPoints[ i ];
			this.controlPoints[ i ] = new THREE.Vector4( point.x, point.y, point.z, point.w );

		}

	};

	NURBSCurve.prototype = Object.create( THREE.Curve.prototype );
	NURBSCurve.prototype.constructor = NURBSCurve;

	NURBSCurve.prototype.getPoint = function ( t, optionalTarget ) {

		var point = optionalTarget || new THREE.Vector3();
		var u = this.knots[ this.startKnot ] + t * ( this.knots[ this.endKnot ] - this.knots[ this.startKnot ] ); // linear mapping t->u
		// following results in (wx, wy, wz, w) homogeneous point

		var hpoint = THREE.NURBSUtils.calcBSplinePoint( this.degree, this.knots, this.controlPoints, u );

		if ( hpoint.w != 1.0 ) {

			// project to 3D space: (wx, wy, wz, w) -> (x, y, z, 1)
			hpoint.divideScalar( hpoint.w );

		}

		return point.set( hpoint.x, hpoint.y, hpoint.z );

	};

	NURBSCurve.prototype.getTangent = function ( t, optionalTarget ) {

		var tangent = optionalTarget || new THREE.Vector3();
		var u = this.knots[ 0 ] + t * ( this.knots[ this.knots.length - 1 ] - this.knots[ 0 ] );
		var ders = THREE.NURBSUtils.calcNURBSDerivatives( this.degree, this.knots, this.controlPoints, u, 1 );
		tangent.copy( ders[ 1 ] ).normalize();
		return tangent;

	};

	THREE.NURBSCurve = NURBSCurve;

} )();
